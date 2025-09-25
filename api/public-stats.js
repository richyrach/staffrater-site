// /api/public-stats.js
const kvUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export default async function handler(req, res) {
  try {
    if (kvUrl && kvToken) {
      const r = await fetch(`${kvUrl.replace(/\/$/,"")}/get/${encodeURIComponent("sr:stats")}`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      const j = await r.json().catch(() => ({}));
      const value = j.result || j.value;
      if (value) return res.status(200).json({ ok: true, ...JSON.parse(value) });
    }
    // fallback placeholders
    res.status(200).json({ ok: true, guilds: 0, users: 0, uptime: 0 });
  } catch (e) {
    res.status(200).json({ ok: true, guilds: 0, users: 0, uptime: 0 });
  }
}
