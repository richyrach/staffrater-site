// /api/logout.js
const kvUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export default async function handler(req, res) {
  try {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)sr_session=([^;]+)/);
    const sid = m ? decodeURIComponent(m[1]) : null;

    if (sid && kvUrl && kvToken && sid.length === 32) {
      const key = `sr:sessions:${sid}`;
      const delUrl = `${kvUrl.replace(/\/$/,"")}/del/${encodeURIComponent(key)}`;
      try {
        await fetch(delUrl, { method: "POST", headers: { Authorization: `Bearer ${kvToken}` }});
      } catch (e) { console.error("KV del failed:", e); }
    }

    res.setHeader("Set-Cookie", "sr_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send("logout_failed");
  }
}
