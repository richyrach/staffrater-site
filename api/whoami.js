"use strict";

// /api/whoami.js
module.exports = async (req, res) => {
  const raw = req.headers.cookie || "";
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`Host: ${req.headers.host}\nCookies: ${raw || "(none)"}\nTip: You should see sr_session here on www.staffrater.xyz.`);
};
