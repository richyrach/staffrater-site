"use strict";
// Quick check that Vercel can see your Upstash env and that REST path style works.

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN;

  if (!url || !token) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      ok: false,
      error: "missing_upstash_env",
      has_url: Boolean(url),
      has_token: Boolean(token)
    }));
  }

  try {
    const r = await fetch(`${url}/ping`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const j = await r.json().catch(()=>null);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, pingResult: j }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "upstash_ping_failed", detail: String(e) }));
  }
};
