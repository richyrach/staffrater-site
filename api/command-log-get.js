"use strict";

// /api/command-log-get.js
// Dashboard reads recent commands for a guild.

const { getSessionFromReq, userManagesGuild } = require("../lib/auth");

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

    const session = getSessionFromReq(req);
    if (!session || !session.user) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "no_session" }));
    }

    const full = new URL(req.url, `https://${req.headers.host}`);
    const gid = (full.searchParams.get("guild_id") || "").trim();
    if (!gid || !/^\d{1,20}$/.test(gid)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: "missing_guild_id" }));
    }

    // A valid session is NOT enough — without this check any signed-in user
    // could read the command log of any guild just by changing guild_id.
    if (!(await userManagesGuild(session, gid))) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok: false, error: "forbidden" }));
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
