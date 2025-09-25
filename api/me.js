"use strict";

// /api/me.js
const { getSessionFromReq } = require("../lib/auth");

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    const session = getSessionFromReq(req);
    if (!session) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false }));
    }
    res.end(JSON.stringify({ ok: true, session }));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false }));
  }
};
