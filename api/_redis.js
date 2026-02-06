"use strict";

// Minimal Upstash Redis REST helper.
// Supports env var naming conventions:
// - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// - REDIS_REST_URL / REDIS_REST_TOKEN
// - KV_REST_API_URL / KV_REST_API_TOKEN (Upstash integration)
// - KV_REST_API_READ_ONLY_TOKEN (read-only)

function getRedisEnv() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    "";

  // Prefer write token; fall back to read-only for read endpoints.
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.KV_REST_API_READ_ONLY_TOKEN ||
    "";

  return { url: url.trim(), token: token.trim() };
}

async function redisCall(command, ...args) {
  const { url, token } = getRedisEnv();
  if (!url || !token) {
    const err = new Error("missing_redis_env");
    err.code = "missing_redis_env";
    throw err;
  }

  // Upstash REST format: {baseUrl}/{command}/{arg1}/{arg2}/...
  const parts = [command, ...args].map((x) => encodeURIComponent(String(x)));
  const endpoint = url.replace(/\/$/, "") + "/" + parts.join("/");

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text().catch(() => "");
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  if (!r.ok) {
    const err = new Error("redis_rest_error");
    err.status = r.status;
    err.body = text;
    throw err;
  }

  // Upstash returns { result: ... }
  return json && Object.prototype.hasOwnProperty.call(json, "result") ? json.result : json;
}

module.exports = { redisCall };
