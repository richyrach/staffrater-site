// /api/login.js
export default async function handler(req, res) {
  const SITE = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
  const canonicalHost = new URL(SITE).host;

  // If user hit a non-canonical host (e.g. apex), bounce to canonical first.
  if (req.headers.host !== canonicalHost) {
    res.writeHead(302, { Location: `https://${canonicalHost}/api/login` });
    return res.end();
  }

  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

  // CSRF state cookie (host-only, now always set on the canonical host)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.setHeader(
    "Set-Cookie",
    `sr_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DISCORD_CLIENT_ID,
    scope: "identify guilds",
    redirect_uri: redirectUri,
    state,
    prompt: "consent",
  });

  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
  });
  res.end();
}
