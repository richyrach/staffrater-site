"use strict";

// /api/bot?guild_id=...&resource=settings|staff|analytics|applications
//
// The gate between a signed-in Discord user and the bot's API. The bot trusts a
// valid signature and does not know who is asking, so *this* is where we prove
// the caller actually manages the guild they named. Without this check any
// signed-in user could reconfigure anyone's server.

const { getSessionFromReq, userManagesGuild } = require("../lib/auth");
const { botFetch, configured } = require("../lib/botapi");

const RESOURCES = {
  settings:     { path: "settings",     write: true  },
  staff:        { path: "staff",        write: true  },
  analytics:    { path: "analytics",    write: false },
  applications: { path: "applications", write: false },
  members:      { path: "members",      write: false },
};

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
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
  try {
    if (!configured()) {
      return send(res, 503, { ok: false, error: "bot_api_not_configured",
        note: "Set BOT_API_URL and DASHBOARD_API_SECRET in the Vercel project env." });
    }

    const session = getSessionFromReq(req);
    if (!session || !session.user) return send(res, 401, { ok: false, error: "no_session" });

    const url = new URL(req.url, `https://${req.headers.host}`);
    const gid = (url.searchParams.get("guild_id") || "").trim();
    const key = (url.searchParams.get("resource") || "").trim();

    if (!/^\d{1,20}$/.test(gid)) return send(res, 400, { ok: false, error: "bad_guild_id" });
    const spec = RESOURCES[key];
    if (!spec) return send(res, 400, { ok: false, error: "bad_resource" });

    const method = req.method === "POST" ? "POST" : "GET";
    if (method === "POST" && !spec.write) {
      return send(res, 405, { ok: false, error: "read_only_resource" });
    }

    // The authorisation check the bot cannot make for itself.
    if (!(await userManagesGuild(session, gid))) {
      return send(res, 403, { ok: false, error: "forbidden" });
    }

    const body = method === "POST" ? await readBody(req) : null;
    const upstream = new URLSearchParams();
    if (key === "members") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q) upstream.set("q", q.slice(0, 64));
    }
    if (key === "analytics") {
      const from = (url.searchParams.get("from") || "").trim();
      const to = (url.searchParams.get("to") || "").trim();
      if (from) upstream.set("from", from);
      if (to) upstream.set("to", to);
    }
    const suffix = upstream.toString() ? `?${upstream.toString()}` : "";
    const { status, json } = await botFetch(`/api/guild/${gid}/${spec.path}${suffix}`, { method, body });
    return send(res, status, json);
  } catch (e) {
    if (e.code === "bot_timeout") {
      return send(res, 504, { ok: false, error: "bot_offline",
        note: "The bot did not respond. It may be restarting." });
    }
    console.error("bot proxy error:", e && e.message);
    return send(res, 500, { ok: false, error: "server_error" });
  }
};
