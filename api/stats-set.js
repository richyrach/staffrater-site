"use strict";

// /api/stats-set.js
// Bot pushes global stats snapshots here (optional auth).

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

function ingestAuthorized(req) {
  const expected = (process.env.INGEST_TOKEN || "").trim();
  if (!expected) return true;
  const auth = (req.headers.authorization || "").trim();
  const tok = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return tok && tok === expected;
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    }

    if (!ingestAuthorized(req)) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : null;
        if (!payload || typeof payload !== "object") {
          res.statusCode = 400;
          return res.end(JSON.stringify({ ok: false, error: "bad_json" }));
        }

        // Store latest snapshot and keep a small history list.
        await redisCall("set", "sr:stats:latest", JSON.stringify(payload));
        await redisCall("lpush", "sr:stats:history", JSON.stringify(payload));
        await redisCall("ltrim", "sr:stats:history", 0, 287); // ~24h if sent every 5 min

        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error("stats-set parse/store error:", e);
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: "server_error" }));
      }
    });
  } catch (e) {
    console.error("stats-set error:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
