"use strict";

// /api/login.js
module.exports = async (req, res) => {
  const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
  const urlObj = new URL(SITE);
  const canonicalHost = urlObj.host;

  // 1) Always use the canonical host so the state cookie and callback match
  if (req.headers.host !== canonicalHost) {
    res.writeHead(302, { Location: `https://${canonicalHost}/api/login` });
    return res.end();
  }

  // 2) Cookie domain so it works on apex + www
  const baseDomain = urlObj.hostname.replace(/^www\./, "");
  const domainAttr = `Domain=.${baseDomain}`;

  // 3) Exact redirect URI (must match Discord Developer Portal)
  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

  // 4) CSRF state cookie
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.setHeader(
    "Set-Cookie",
    `sr_state=${encodeURIComponent(state)}; ${domainAttr}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  // 5) Build the Discord authorize URL with strict encoding
  const authorizeURL =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("identify guilds")}` + // encodes as %20, not +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=consent`;

  res.writeHead(302, { Location: authorizeURL });
  res.end();
};
