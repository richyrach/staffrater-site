export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  const guildId = String(req.query.guild_id || "").trim();
  if (!guildId) return res.status(400).json({ ok: false, error: "MISSING_GUILD_ID" });

  const key = `cmdlog:${guildId}`;

  try {
    const logs = (await redisGetJson(key)) || [];
    return res.status(200).json({ ok: true, guild_id: guildId, logs });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "REDIS_READ_FAILED" });
  }
}

function upstash() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL ||
    process.env.KV_REST_API_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) throw new Error("Missing Upstash REST env vars");
  return { url, token };
}

async function redisGetJson(key) {
  const { url, token } = upstash();
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!j || j.result == null) return null;
  try { return JSON.parse(j.result); } catch { return null; }
}
