const { createHmac } = require("crypto");
const TOKEN_URL = "https://discord.com/api/oauth2/token";
const USER_URL  = "https://discord.com/api/users/@me";

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get("code");
    if (!code) { res.writeHead(302, { Location: "/?login=error" }); return res.end(); }

    // 1) exchange code for token
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.OAUTH_REDIRECT_URI
    });
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!tokenRes.ok) { res.writeHead(302, { Location: "/?login=token_failed" }); return res.end(); }
    const token = await tokenRes.json(); // {access_token, refresh_token, expires_in, ...}

    // 2) get user profile
    const meRes = await fetch(USER_URL, { headers: { Authorization: `Bearer ${token.access_token}` }});
    if (!meRes.ok) { res.writeHead(302, { Location: "/?login=user_failed" }); return res.end(); }
    const me = await meRes.json();

    // 3) session cookie (profile only)
    const sessionData = {
      id: me.id,
      username: me.username,
      global_name: me.global_name || null,
      avatar: me.avatar || null
    };
    const sessPayload = Buffer.from(JSON.stringify(sessionData)).toString("base64url");
    const sessSig = sign(sessPayload, process.env.SESSION_SECRET);
    setCookie(res, "sr_session", `${sessPayload}.${sessSig}`, {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60*60*24*30
    });

    // 4) auth cookie (token & expiry) — also signed
    const expiresAt = Math.floor(Date.now()/1000) + (token.expires_in || 3600);
    const authData = { access_token: token.access_token, refresh_token: token.refresh_token || null, exp: expiresAt };
    const authPayload = Buffer.from(JSON.stringify(authData)).toString("base64url");
    const authSig = sign(authPayload, process.env.SESSION_SECRET);
    setCookie(res, "sr_auth", `${authPayload}.${authSig}`, {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60*60*24*30
    });

    res.writeHead(302, { Location: "/?logged=1" });
    res.end();
  } catch (e) {
    res.writeHead(302, { Location: "/?login=exception" });
    res.end();
  }
};
