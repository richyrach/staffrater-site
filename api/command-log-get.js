"use strict";

// /api/command-log-get.js
// Dashboard reads recent commands for a guild.

const { getSessionFromReq } = require("../lib/auth");
const { redisCall } = require("./_redis");

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    const session = getSessionFromReq(req);
    if (!session || !session.user) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "no_session" }));
    }

    const full = new URL(req.url, `https://${req.headers.host}`);
    const gid = (full.searchParams.get("guild_id") || "").trim();
    if (!gid) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: "missing_guild_id" }));
    }

    const key = `sr:cmdlog:${gid}`;
    let items = [];
    try {
      const raw = await redisCall("lrange", key, 0, 49);
      items = Array.isArray(raw)
        ? raw.map((s) => {
            try { return JSON.parse(s); } catch { return null; }
          }).filter(Boolean)
        : [];
    } catch (e) {
      if (e && e.code === "missing_redis_env") {
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: "redis_not_configured" }));
      }
      throw e;
    }

    return res.end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    console.error("command-log-get error:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
