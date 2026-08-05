"use strict";

// /api/stats-set.js
// Bot pushes the public stats snapshot here; anyone may read it back.

const crypto = require("crypto");
const { redisEnv, redisGetJson, redisSetJson } = require("../lib/redis");

const KEY = "sr:public:stats:latest";
const TTL_SECONDS = 60 * 60 * 6; // 6 hours

function pushAuthorized(req) {
  const secret = (process.env.STATS_PUSH_SECRET || "").trim();
  // Fail CLOSED: a missing secret used to leave this endpoint world-writable,
  // letting anyone overwrite the numbers shown on the homepage.
  if (!secret) return false;
  const auth = req.headers["authorization"] || "";
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

function readBody(req) {
  if (req.body != null) {
    return Promise.resolve(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("body_too_large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      if (!redisEnv().configured) {
        res.statusCode = 200;
        return res.end(JSON.stringify({ ok: false, error: "not_configured", data: null }));
      }
      const data = await redisGetJson(KEY);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: data || null }));
    }

    if (req.method === "POST") {
      if (!pushAuthorized(req)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      }
      if (!redisEnv().configured) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ ok: false, error: "not_configured" }));
      }

      const body = (await readBody(req)) || {};
      const now = new Date().toISOString();
      const payload = {
        guilds: Number(body.guilds || 0),
        total_ratings: Number(body.total_ratings || 0),
        avg_rating: Number(body.avg_rating || 0),
        tickets_open: Number(body.tickets_open || 0),
        tickets_closed: Number(body.tickets_closed || 0),
        apps_total: Number(body.apps_total || 0),
        cmds_24h: Number(body.cmds_24h || 0),
        ts: body.ts || now,
        updated_at: body.updated_at || body.ts || now,
      };

      await redisSetJson(KEY, payload, TTL_SECONDS);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true }));
    }

    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    return res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
  } catch (e) {
    console.error("stats-set error:", e && e.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
