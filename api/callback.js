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

function signPayload(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error || !code) {
      res.statusCode = 302;
      res.setHeader("Location", "/?login=error");
      return res.end();
    }

    // Exchange code for token
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

    if (!tokenRes.ok) {
      res.statusCode = 302;
      res.setHeader("Location", "/?login=token_failed");
      return res.end();
    }

    const token = await tokenRes.json();

    // Fetch user identity
    const userRes = await fetch(USER_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!userRes.ok) {
      res.statusCode = 302;
      res.setHeader("Location", "/?login=user_failed");
      return res.end();
    }
    const user = await userRes.json();

    // Create signed session cookie with minimal data
    const sessionData = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || null,
      avatar: user.avatar || null
    };
    const payload = Buffer.from(JSON.stringify(sessionData)).toString("base64url");
    const sig = signPayload(payload, process.env.SESSION_SECRET);
    const cookieValue = `${payload}.${sig}`;

    setCookie(res, "sr_session", cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    // Back to homepage
    res.statusCode = 302;
    res.setHeader("Location", "/?logged=1");
    res.end();
  } catch (e) {
    res.statusCode = 302;
    res.setHeader("Location", "/?login=exception");
    res.end();
  }
};
