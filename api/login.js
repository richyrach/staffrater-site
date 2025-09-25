"use strict";

// /api/login.js
module.exports = async (req, res) => {
  const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
  const urlObj = new URL(SITE);
  const canonicalHost = urlObj.host;

  // Always use the canonical host so cookie & callback match
  if (req.headers.host !== canonicalHost) {
    const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.writeHead(302, { Location: `https://${canonicalHost}/api/login${q}` });
    return res.end();
  }

  const baseDomain = urlObj.hostname.replace(/^www\./, "");
  const domainAttr = `Domain=.${baseDomain}`;
  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

  // CSRF state cookie (10 minutes)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.setHeader(
    "Set-Cookie",
    `sr_state=${encodeURIComponent(state)}; ${domainAttr}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  // Build the Discord authorize URL with strict encoding
  const authorizeURL =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID || "")}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("identify guilds")}` + // => %20 (not +)
    `&state=${encodeURIComponent(state)}` +
    `&prompt=consent`;

  // DEBUG MODE: show the exact URL instead of redirecting
  const full = new URL(req.url, `https://${req.headers.host}`);
  if (full.searchParams.get("debug") === "1") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>body{font-family: ui-sans-serif, system-ui; padding:20px; color:#fff; background:#0b1020}</style>
      <h2>Discord OAuth Debug</h2>
      <p><strong>Authorize URL:</strong></p>
      <p><a style="word-break:break-all" href="${authorizeURL}">${authorizeURL}</a></p>
      <hr/>
      <p><strong>SITE_BASE_URL</strong>: ${SITE}</p>
      <p><strong>Current Host</strong>: ${req.headers.host}</p>
      <p><strong>Client ID (first 6 … last 4)</strong>: ${
        (process.env.DISCORD_CLIENT_ID || "").slice(0,6)
      }…${
        (process.env.DISCORD_CLIENT_ID || "").slice(-4)
      }</p>
      <p><strong>Redirect URI</strong>: ${redirectUri}</p>
      <p><strong>State</strong>: ${state}</p>
      <p>If Discord shows 404 when you click the URL above, the cause is almost always one of these:
      <ul>
        <li>Redirect URI not <em>exactly</em> whitelisted in the Discord Developer Portal</li>
        <li>Client ID is wrong / has a typo</li>
        <li>App not saved after adding redirect</li>
      </ul>
      </p>
    `);
  }

  // Normal flow: redirect to Discord
  res.writeHead(302, { Location: authorizeURL });
  res.end();
};
