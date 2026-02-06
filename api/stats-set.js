"use strict";

// /api/stats-set.js
// Bot pushes global stats snapshots here (optional auth).

const { redisCall } = require("./_redis");

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
