"use strict";

// /api/command-log-push.js
// Bot pushes command log entries here.
// Stores per-guild recent commands in Upstash Redis.

const { redisCall } = require("./_redis");

function ingestAuthorized(req) {
  const expected = (process.env.INGEST_TOKEN || "").trim();
  if (!expected) return true; // allow if no token configured
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
        const entry = body ? JSON.parse(body) : null;
        const gid = (entry && entry.guild_id) ? String(entry.guild_id) : "";
        if (!gid) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ ok: false, error: "missing_guild_id" }));
        }

        // Keep only the fields used by the dashboard.
        const item = {
          ts: entry.ts || new Date().toISOString(),
          user: entry.user_name || entry.user_id || "unknown",
          cmd: entry.cmd_name || entry.name || "unknown",
          channel: entry.channel_name || entry.channel_id || "",
        };

        const key = `sr:cmdlog:${gid}`;
        await redisCall("lpush", key, JSON.stringify(item));
        await redisCall("ltrim", key, 0, 199); // keep last 200

        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error("command-log-push parse/store error:", e);
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: "server_error" }));
      }
    });
  } catch (e) {
    console.error("command-log-push error:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
