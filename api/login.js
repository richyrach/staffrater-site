"use strict";

// /api/login.js
const { issueState } = require("../lib/auth");

module.exports = async (req, res) => {
  const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
  const u = new URL(SITE);
  const canonicalHost = u.host;

  // Force canonical host to avoid mismatch issues
  if (req.headers.host !== canonicalHost) {
    const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.writeHead(302, { Location: `https://${canonicalHost}/api/login${q}` });
    return res.end();
  }

  // Return target: explicit ?return=... else "/" (home)
  const current = new URL(req.url, SITE);
  let returnTo = current.searchParams.get("return") || "/";
  if (!returnTo.startsWith("/")) returnTo = "/";

  // Pack returnTo inside a signed state (no cookie)
  const state = issueState(returnTo);
  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

  const authorizeURL =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID || "")}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("identify guilds")}` +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=consent`;

  res.writeHead(302, { Location: authorizeURL });
  res.end();
};
