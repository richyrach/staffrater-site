"use strict";
module.exports = async (req, res) => {
  try {
    const full = new URL(req.url, `https://${req.headers.host || "www.staffrater.xyz"}`);
    const redirect = full.searchParams.get("redirect") || "/";
    const to = redirect.startsWith("/") ? redirect : "/";

    // Actually clear the session cookie server-side (the old page only cleared
    // sessionStorage, so the cookie survived "logging out").
    res.setHeader("Set-Cookie", "sr_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<body style="background:#0b1020;color:#fff;font-family:ui-sans-serif,system-ui;padding:24px">
  <h3>Logging out…</h3>
  <script>try{sessionStorage.removeItem('sr_token')}catch(e){};location.replace(${JSON.stringify(to)});</script>
</body>`);
  } catch (e) {
    console.error("Logout crash:", e);
    res.statusCode = 500;
    res.end("logout_failed");
  }
};
