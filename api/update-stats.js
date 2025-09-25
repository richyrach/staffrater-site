// /api/update-stats.js
// Bot posts here with header X-STAFFRATER-KEY
const kvUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    const key = req.headers["x-staffrater-key"];
    if (!key || key !== process.env.STATS_WRITE_KEY) return res.status(401).end();

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (!kvUrl || !kvToken) return res.status(500).json({ ok: false, error: "no_kv" });

    const payload = JSON.stringify({
      guilds: Number(body.guilds || 0),
      users: Number(body.users || 0),
      uptime: Number(body.uptime || 0),
      updatedAt: Date.now(),
    });

    const setUrl = `${kvUrl.replace(/\/$/,"")}/set/${encodeURIComponent("sr:stats")}/${encodeURIComponent(payload)}`;
    const r = await fetch(setUrl, { method: "POST", headers: { Authorization: `Bearer ${kvToken}` }});
    if (!r.ok) return res.status(500).json({ ok: false, error: "kv_fail" });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
}
