"use strict";
// /api/callback.js — small token: only { user, at } and a short expiry

const { parseState, issueSessionToken } = require("../lib/auth");

module.exports = async (req, res) => {
  try {
    const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
    const u = new URL(SITE);
    const canonicalHost = u.host;

    // ensure we stay on the canonical host
    if (req.headers.host !== canonicalHost) {
      const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.writeHead(302, { Location: `https://${canonicalHost}/api/callback${q}` });
      return res.end();
    }

    const full = new URL(req.url, SITE);
    const code = full.searchParams.get("code");
    const stateStr = full.searchParams.get("state");
    const state = parseState(stateStr);
    if (!code || !state) {
      res.statusCode = 400;
      return res.end("bad state");
    }
    const returnTo = state.ret && state.ret.startsWith("/") ? state.ret : "/";

    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
      res.statusCode = 500;
      return res.end("server not configured");
    }

    const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;
    const form = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    // Exchange code for access token
    const tr = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!tr.ok) {
      console.error("Token exchange failed:", await tr.text());
      res.statusCode = 500;
      return res.end("oauth failed");
    }
    const tj = await tr.json();
    const accessToken = tj.access_token;
    const expiresInMs = (tj.expires_in ? tj.expires_in * 1000 : 3600_000);
    const ttl = Math.min(expiresInMs - 300_000, 12 * 60 * 60 * 1000); // <= 12h, minus 5m safety

    // Get minimal user (for header/avatar)
    const meR = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meR.ok) {
      res.statusCode = 502;
      return res.end("discord api failed");
    }
    const me = await meR.json();

    // SMALL session: user + access token (no guilds inside token)
    const session = {
      user: {
        id: me.id,
        username: `${me.username}${me.discriminator === "0" ? "" : "#" + me.discriminator}`,
        avatar: me.avatar,
      },
      at: accessToken,               // store Discord access token
      createdAt: Date.now(),
      exp: Date.now() + Math.max(10 * 60 * 1000, ttl) // at least 10m, up to ~12h
    };

    const token = issueSessionToken(session);

    // Session goes in an HttpOnly cookie, NOT in the URL fragment + sessionStorage.
    // The old flow meant any XSS on the site could read the token and, with it, the
    // user's Discord OAuth token. HttpOnly puts it out of reach of page scripts.
    const maxAge = Math.floor((session.exp - Date.now()) / 1000);
    res.setHeader("Set-Cookie", [
      `sr_session=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${maxAge > 0 ? maxAge : 600}`,
    ].join("; "));

    res.setHeader("Cache-Control", "no-store");
    res.writeHead(302, { Location: returnTo }); // path only (same host)
    res.end();
  } catch (e) {
    console.error("Callback crash:", e);
    res.statusCode = 500;
    res.end("callback error");
  }
};
