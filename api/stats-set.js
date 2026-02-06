export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  // Optional shared secret (recommended)
  const ingest = process.env.INGEST_TOKEN;
  if (ingest) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${ingest}`) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!body) return res.status(400).json({ ok: false, error: "BAD_BODY" });

  try {
    await redisSetJson("stats:latest", {
      ...body,
      ts: body.ts || new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "REDIS_WRITE_FAILED" });
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

async function redisSetJson(key, obj) {
  const { url, token } = upstash();
  const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(obj) }),
  });
  if (!r.ok) throw new Error("SET failed");
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
