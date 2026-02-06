"use strict";

// /api/stats-get.js
// Public read of latest stats snapshot.

async function redisCall(cmd, ...args) {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) {
    const err = new Error("Missing Redis REST env");
    err.code = "missing_redis_env";
    throw err;
  }
  const url = `${baseUrl.replace(/\/+$/,'')}/${cmd}/${args.map(a=>encodeURIComponent(String(a))).join('/')}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Upstash error: ${r.status}`);
  if (j && typeof j === 'object' && 'error' in j && j.error) throw new Error(String(j.error));
  return j.result;
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    let latest = null;
    try {
      latest = await redisCall("get", "sr:stats:latest");
    } catch (e) {
      if (e && e.code === "missing_redis_env") {
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: "redis_not_configured" }));
      }
      throw e;
    }

    if (!latest) return res.end(JSON.stringify({ ok: true, stats: null }));
    try {
      return res.end(JSON.stringify({ ok: true, stats: JSON.parse(latest) }));
    } catch {
      return res.end(JSON.stringify({ ok: true, stats: null }));
    }
  } catch (e) {
    console.error("stats-get error:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
