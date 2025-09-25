// /api/logout.js
export default async function handler(req, res) {
  try {
    res.setHeader(
      "Set-Cookie",
      "sr_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"
    );
    const to = new URL(req.url, `https://${req.headers.host}`).searchParams.get("redirect") || "/";
    const safe = to.startsWith("/") ? to : "/";
    res.writeHead(302, { Location: safe });
    res.end();
  } catch (e) {
    console.error("Logout crash:", e);
    res.status(500).send("logout_failed");
  }
}
