"use strict";

const { getSessionFromReq, fetchUserGuilds } = require("../lib/auth");
const { botFetch, configured } = require("../lib/botapi");

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  try {
    const session = getSessionFromReq(req);
    if (!session || !session.user || !session.at) {
      return send(res, 401, { ok: false, error: "no_session" });
    }
    if (!configured()) {
      return send(res, 503, { ok: false, error: "bot_api_not_configured" });
    }

    const [userGuilds, botResult] = await Promise.all([
      fetchUserGuilds(session),
      botFetch("/api/guilds"),
    ]);
    if (!Array.isArray(userGuilds)) {
      return send(res, 401, { ok: false, error: "expired" });
    }
    if (botResult.status !== 200 || !botResult.json || !botResult.json.ok) {
      return send(res, 502, { ok: false, error: "bot_membership_unavailable" });
    }

    const botGuilds = new Map((botResult.json.guilds || []).map((g) => [String(g.id), g]));
    const guilds = userGuilds
      .filter((g) => g && g.owner === true && botGuilds.has(String(g.id)))
      .map((g) => {
        const live = botGuilds.get(String(g.id));
        return {
          id: String(g.id),
          name: g.name,
          icon: g.icon,
          members: live.members == null ? null : Number(live.members),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return send(res, 200, { ok: true, user: session.user, guilds });
  } catch (error) {
    if (error && error.code === "bot_timeout") {
      return send(res, 504, { ok: false, error: "bot_offline" });
    }
    console.error("servers error:", error && error.message);
    return send(res, 500, { ok: false, error: "server_error" });
  }
};
