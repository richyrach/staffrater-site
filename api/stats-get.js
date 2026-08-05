"use strict";

// /api/stats-get.js
// Public read of the latest stats the bot pushed.

const { redisEnv, redisGetJson } = require("../lib/redis");

const KEY = "sr:public:stats:latest";
const KEY_TOP = "sr:public:stats:top_guilds";

const EMPTY = {
  guilds: null,
  total_ratings: null,
  avg_rating: null,
  tickets_open: null,
  tickets_closed: null,
  apps_total: null,
  cmds_24h: null,
  ts: null,
  updated_at: null,
  top_guilds: [],
};

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
  }

  if (!redisEnv().configured) {
    // Report the misconfiguration rather than crashing the function.
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: false,
      error: "not_configured",
      note: "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set on this deployment.",
      ...EMPTY,
    }));
  }

  try {
    const latest = await redisGetJson(KEY);
    const topGuilds = (await redisGetJson(KEY_TOP)) || [];

    if (!latest) {
      res.statusCode = 200;
      return res.end(JSON.stringify({
        ok: true,
        ...EMPTY,
        note: "No stats yet. Waiting for the bot to push to /api/stats-set.",
      }));
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ...EMPTY, ...latest, top_guilds: topGuilds }));
  } catch (e) {
    console.error("stats-get error:", e && e.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "server_error", ...EMPTY }));
  }
};
