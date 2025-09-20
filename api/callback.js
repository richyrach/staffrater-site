// /api/callback.js
import crypto from "crypto";

const kvUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

function b64url(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export default async function handler(req, res) {
  try {
    const SITE = process.env.SITE_BASE_URL || `https://${req.headers.host}`;
    const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

    const url = new URL(req.url, SITE);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)sr_state=([^;]+)/);
    const savedState = m ? decodeURIComponent(m[1]) : null;
    if (!code || !state || state !== savedState) {
      res.status(400).send("Bad state.");
      return;
    }

    // Exchange code for token
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      console.error("token exchange failed:", t);
      res.status(500).send("OAuth failed");
      return;
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;

    // Get user + guilds
    const [meResp, guildsResp] = await Promise.all([
      fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    const me = await meResp.json();
    const guilds = await guildsResp.json();

    // Create session payload
    const sid = crypto.randomBytes(16).toString("hex");
    const session = {
      sid,
      user: {
        id: me.id,
        username: `${me.username}${me.discriminator === "0" ? "" : "#" + me.discriminator}`,
        avatar: me.avatar,
      },
      guilds,
      createdAt: Date.now(),
    };

    // Prefer KV (7 days TTL); else cookie-only
    if (kvUrl && kvToken) {
      const key = `sr:sessions:${sid}`;
      // Upstash REST: /set/<key>/<value> with TTL
      const payload = JSON.stringify(session);
      const setUrl = `${kvUrl.replace(/\/$/,"")}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?EX=604800`;
      const r = await fetch(setUrl, { method: "POST", headers: { Authorization: `Bearer ${kvToken}` }});
      if (!r.ok) console.error("KV set failed", await r.text());
      res.setHeader(
        "Set-Cookie",
        `sr_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      );
    } else {
      // Signed cookie session
      const secret = process.env.SESSION_SECRET || "dev-secret";
      const json = JSON.stringify(session);
      const token = b64url(json) + "." + sign(json, secret);
      res.setHeader(
        "Set-Cookie",
        `sr_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      );
    }

    res.writeHead(302, { Location: "/dashboard.html" });
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send("Callback error");
  }
}
