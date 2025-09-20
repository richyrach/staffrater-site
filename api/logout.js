// /api/logout.js
// Node serverless function for Vercel (not Edge).
// - Clears sr_session cookie
// - Deletes session from Upstash (if configured)
// - Redirects to "/" or to ?redirect=/your-page

export default async function handler(req, res) {
  try {
    // 1) Read the session cookie safely
    const rawCookie = req.headers?.cookie || "";
    const match = rawCookie.match(/(?:^|;\s*)sr_session=([^;]+)/);
    const sid = match ? decodeURIComponent(match[1]) : null;

    // 2) If we have Upstash creds & a session id, delete it
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (sid && url && token) {
      const key = `sr:sessions:${sid}`;
      try {
        await fetch(`${url}/del/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        // Don't fail logout if Redis call has an issue
        console.error("Upstash DEL failed:", e);
      }
    }

    // 3) Clear the cookie
    // NOTE: must be HttpOnly+Secure on HTTPS domain
    res.setHeader(
      "Set-Cookie",
      [
        // nuke current cookie
        "sr_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      ]
    );

    // 4) Figure out where to send the user next
    const fullUrl = new URL(req.url, `https://${req.headers.host}`);
    const redirect = fullUrl.searchParams.get("redirect") || "/";
    const safeRedirect = redirect.startsWith("/") ? redirect : "/";

    // 5) Redirect
    res.writeHead(302, { Location: safeRedirect });
    res.end();
  } catch (err) {
    console.error("Logout crashed:", err);
    res
      .status(500)
      .json({ error: "logout_failed", details: String(err) });
  }
}
