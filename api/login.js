"use strict";

// /api/login.js
module.exports = async (req, res) => {
  const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
  const urlObj = new URL(SITE);
  const canonicalHost = urlObj.host;

  // Always run on the canonical host so cookie scope matches
  if (req.headers.host !== canonicalHost) {
    res.writeHead(302, { Location: `https://${canonicalHost}/api/login` });
    return res.end();
  }

  // Cookie domain for apex+www (e.g., .staffrater.xyz)
  const baseDomain = urlObj.hostname.replace(/^www\./, "");
  const domainAttr = `Domain=.${baseDomain}`;

  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

  // CSRF state cookie (10 minutes)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.setHeader(
    "Set-Cookie",
    `sr_state=${encodeURIComponent(state)}; ${domainAttr}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DISCORD_CLIENT_ID,
    scope: "identify guilds",
    redirect_uri: redirectUri,
    state,
    prompt: "consent",
  });

  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${p.toString()}`,
  });
  res.end();
};
