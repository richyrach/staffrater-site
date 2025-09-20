// /api/login.js
export default async function handler(req, res) {
  const SITE = process.env.SITE_BASE_URL || `https://${req.headers.host}`;
  const redirectUri = `${SITE.replace(/\/$/, "")}/api/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DISCORD_CLIENT_ID,
    scope: "identify guilds",
    redirect_uri: redirectUri,
    prompt: "consent",
  });

  // CSRF state (simple nonce saved in cookie)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.setHeader(
    "Set-Cookie",
    `sr_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  params.set("state", state);
  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
  });
  res.end();
}
