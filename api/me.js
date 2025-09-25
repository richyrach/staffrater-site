"use strict";
// /api/me.js — verify our small token, then fetch guilds live using Discord access token

const { getSessionFromReq } = require("../lib/auth");

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    const session = getSessionFromReq(req);
    if (!session || !session.at || !session.user) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "no_session" }));
    }

    // Fetch guilds from Discord using user's OAuth token
    const gsR = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${session.at}` },
    });

    if (gsR.status === 401 || gsR.status === 403) {
      // token expired/invalid — ask client to login again
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "expired" }));
    }

    if (!gsR.ok) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok: false, error: "discord_failed" }));
    }

    const guilds = await gsR.json();

    // Return a clean shape; never return session.at
    return res.end(JSON.stringify({
      ok: true,
      session: {
        user: session.user,
        guilds
      }
    }));
  } catch (e) {
    console.error("me error:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
