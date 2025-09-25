// /api/callback.js
import crypto from "crypto";

function b64url(str) {
  return Buffer.from(str, "utf8")
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

export default async function handler(req, res) {
  try {
    const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
    const canonicalHost = new URL(SITE).host;
    if (req.headers.host !== canonicalHost) {
      const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.writeHead(302, { Location: `https://${canonicalHost}/api/callback${q}` });
      return res.end();
    }

    const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

    const url = new URL(req.url, SITE);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)sr_state=([^;]+)/);
    const savedState = m ? decodeURIComponent(m[1]) : null;
    if (!code || !state || state !== savedState) {
      return res.status(400).send("bad state");
    }

    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
      console.error("Missing DISCORD envs");
      return res.status(500).send("server not configured");
    }

    // Exchange code for tokens
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
      return res.status(500).send("oauth failed");
    }
    const tj = await tr.json();
    const accessToken = tj.access_token;

    // Fetch user + guilds
    const [meR, gsR] = await Promise.all([
      fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    const me = await meR.json();
    const guilds = await gsR.json();

    // Build cookie session (signed)
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
      "sr_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      `sr_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    ]);

    res.writeHead(302, { Location: "/dashboard.html" });
    res.end();
  } catch (e) {
    console.error("Callback crash:", e);
    res.status(500).send("callback error");
  }
}
