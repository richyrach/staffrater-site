"use strict";

// /api/callback.js
const crypto = require("crypto");

function b64url(strUtf8) {
  return Buffer.from(strUtf8, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function sign(payload) {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

module.exports = async (req, res) => {
  try {
    const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
    const urlObj = new URL(SITE);
    const canonicalHost = urlObj.host;

    // Force callback on canonical host (so it sees the same cookie)
    if (req.headers.host !== canonicalHost) {
      const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.writeHead(302, { Location: `https://${canonicalHost}/api/callback${q}` });
      return res.end();
    }

    const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

    // Read code + state
    const full = new URL(req.url, SITE);
    const code = full.searchParams.get("code");
    const state = full.searchParams.get("state");

    // Validate state from cookie
    const rawCookie = req.headers.cookie || "";
    const m = rawCookie.match(/(?:^|;\s*)sr_state=([^;]+)/);
    const savedState = m ? decodeURIComponent(m[1]) : null;
    if (!code || !state || state !== savedState) {
      res.statusCode = 400;
      res.end("bad state");
      return;
    }

    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
      res.statusCode = 500;
      res.end("server not configured");
      return;
    }

    // Exchange code for token (use strict form encoding)
    const form = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const tr = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!tr.ok) {
      const txt = await tr.text();
      console.error("Token exchange failed:", txt);
      res.statusCode = 500;
      res.end("oauth failed");
      return;
    }
    const tj = await tr.json();
    const accessToken = tj.access_token;

    // Fetch identity + guilds
    const [meR, gsR] = await Promise.all([
      fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!meR.ok || !gsR.ok) {
      console.error("Discord API calls failed");
      res.statusCode = 502;
      res.end("discord api failed");
      return;
    }
    const me = await meR.json();
    const guilds = await gsR.json();

    // Build signed session cookie (works on both apex and www)
    const baseDomain = urlObj.hostname.replace(/^www\./, "");
    const domainAttr = `Domain=.${baseDomain}`;

    const session = {
      user: {
        id: me.id,
        username: `${me.username}${me.discriminator === "0" ? "" : "#" + me.discriminator}`,
        avatar: me.avatar,
      },
      guilds,
      createdAt: Date.now(),
    };
    const payload = JSON.stringify(session);
    const token = b64url(payload) + "." + sign(payload);

    res.setHeader("Set-Cookie", [
      `sr_state=; ${domainAttr}; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
      `sr_session=${encodeURIComponent(token)}; ${domainAttr}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    ]);

    // Your dashboard lives at /dashboard/index.html
    res.writeHead(302, { Location: "/dashboard/index.html" });
    res.end();
  } catch (e) {
    console.error("Callback crash:", e);
    res.statusCode = 500;
    res.end("callback error");
  }
};
