"use strict";

const crypto = require("crypto");

function decode(token) {
  try {
    const [b64, sig] = (token || "").split(".");
    if (!b64 || !sig) return null;
    const json = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const expected = crypto
      .createHmac("sha256", process.env.SESSION_SECRET || "dev-secret")
      .update(json)
      .digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (sig !== expected) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    const rawCookie = req.headers.cookie || "";
    const m = rawCookie.match(/(?:^|;\s*)sr_session=([^;]+)/);
    const token = m ? decodeURIComponent(m[1]) : null;
    const session = token ? decode(token) : null;

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
