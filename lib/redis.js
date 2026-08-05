"use strict";

// Minimal Upstash REST helper.
//
// This repo has no package.json, so nothing from npm is installed at build time.
// The @upstash/redis import in the stats endpoints could therefore never resolve,
// which is what made them return FUNCTION_INVOCATION_FAILED. The command-log
// endpoints always worked because they spoke to the REST API directly — this is
// the same approach, shared so there is one copy of it.

function redisEnv() {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return { baseUrl, token, configured: Boolean(baseUrl && token) };
}

async function redisCall(cmd, ...args) {
  const { baseUrl, token, configured } = redisEnv();
  if (!configured) {
    const err = new Error("Missing Redis REST env");
    err.code = "missing_redis_env";
    throw err;
  }
  const url =
    `${baseUrl.replace(/\/+$/, "")}/${cmd}/` +
    args.map((a) => encodeURIComponent(String(a))).join("/");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Upstash error: ${r.status}`);
  if (j && typeof j === "object" && j.error) throw new Error(String(j.error));
  return j.result;
}

// SET with a JSON value. Upstash REST takes the value as a path segment.
async function redisSetJson(key, value, ttlSeconds) {
  const { baseUrl, token, configured } = redisEnv();
  if (!configured) {
    const err = new Error("Missing Redis REST env");
    err.code = "missing_redis_env";
    throw err;
  }
  const body = JSON.stringify(value);
  const path = ttlSeconds ? `set/${encodeURIComponent(key)}?EX=${ttlSeconds}` : `set/${encodeURIComponent(key)}`;
  const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Upstash error: ${r.status}`);
  if (j && typeof j === "object" && j.error) throw new Error(String(j.error));
  return j.result;
}

async function redisGetJson(key) {
  const raw = await redisCall("get", key);
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { redisEnv, redisCall, redisGetJson, redisSetJson };
