"use strict";

// /api/login.js
module.exports = async (req, res) => {
  const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
  const u = new URL(SITE);
  const canonicalHost = u.host;
  const baseDomain = u.hostname.replace(/^www\./, "");
  const domainAttr = `Domain=.${baseDomain}`;

  // Always use canonical host
  if (req.headers.host !== canonicalHost) {
    const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.writeHead(302, { Location: `https://${canonicalHost}/api/login${q}` });
    return res.end();
  }

  // Where to send the user after login
  const current = new URL(req.url, SITE);
  let returnTo = current.searchParams.get("return");
  // If no ?return=, try Referer path on same host; else default "/"
  if (!returnTo) {
    try {
      const ref = req.headers.referer ? new URL(req.headers.referer) : null;
      if (ref && ref.host === canonicalHost) returnTo = ref.pathname + ref.search + ref.hash;
    } catch {}
  }
  if (!returnTo || !returnTo.startsWith("/")) returnTo = "/";

  // CSRF state cookie (10 minutes)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.setHeader("Set-Cookie", [
    `sr_state=${encodeURIComponent(state)}; ${domainAttr}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `sr_ret=${encodeURIComponent(returnTo)}; ${domainAttr}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  ]);

  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;
  const authorizeURL =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID || "")}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("identify guilds")}` + // note: %20 between scopes
    `&state=${encodeURIComponent(state)}` +
    `&prompt=consent`;

  res.writeHead(302, { Location: authorizeURL });
  res.end();
};
