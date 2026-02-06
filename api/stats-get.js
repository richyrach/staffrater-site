"use strict";

// /api/stats-get.js
// Public read of latest stats snapshot.

const { redisCall } = require("./_redis");

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
