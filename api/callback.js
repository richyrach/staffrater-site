"use strict";
// /api/callback.js — stateless OAuth, redirect with #token= (hash) to avoid long URL errors

const { parseState, issueSessionToken } = require("../lib/auth");

module.exports = async (req, res) => {
  try {
    const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
    const u = new URL(SITE);
    const canonicalHost = u.host;

    // Keep host consistent
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

    // Fetch user + guilds
    const [meR, gsR] = await Promise.all([
      fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!meR.ok || !gsR.ok) {
      res.statusCode = 502;
      return res.end("discord api failed");
    }
    const me = await meR.json();
    const guilds = await gsR.json();

    const session = {
      user: {
        id: me.id,
        username: `${me.username}${me.discriminator === "0" ? "" : "#" + me.discriminator}`,
        avatar: me.avatar,
      },
      guilds,
      createdAt: Date.now(),
    };
    const token = require("../lib/auth").issueSessionToken(session);

    // Build final redirect using HASH (so server never sees the token)
    const destPath = returnTo; // same host, only path
    const sep = destPath.includes("#") ? "&" : "#";
    const locationHeader = `${destPath}${sep}token=${encodeURIComponent(token)}`;

    res.setHeader("Cache-Control", "no-store");
    res.writeHead(302, { Location: locationHeader });
    res.end();
  } catch (e) {
    console.error("Callback crash:", e);
    res.statusCode = 500;
    res.end("callback error");
  }
};
