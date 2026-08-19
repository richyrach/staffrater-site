"use strict";

// Signed client for the bot's dashboard API.
//
// The bot listens on a plain-HTTP Pterodactyl allocation, so a bearer token
// would cross the wire in cleartext and stay replayable forever. Requests are
// HMAC-signed instead: the secret never travels, and each signature covers a
// timestamp that the bot rejects outside a 300s window.

const crypto = require("crypto");

const BOT_API_URL = (process.env.BOT_API_URL || "").replace(/\/+$/, "");
const BOT_API_SECRET = process.env.DASHBOARD_API_SECRET || "";

function configured() {
  return Boolean(BOT_API_URL && BOT_API_SECRET);
}

function sign(ts, method, path, body) {
  return crypto
    .createHmac("sha256", BOT_API_SECRET)
    .update(`${ts}\n${method.toUpperCase()}\n${path}\n${body}`)
    .digest("hex");
}

/**
 * Call the bot API. `path` must start with "/" and is signed verbatim, so it
 * has to match exactly what the bot routes on.
 */
async function botFetch(path, { method = "GET", body = null, timeoutMs = 8000 } = {}) {
  if (!configured()) {
    const err = new Error("bot api not configured");
    err.code = "bot_api_not_configured";
    throw err;
  }

  const raw = body == null ? "" : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BOT_API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-SR-Timestamp": ts,
        "X-SR-Signature": sign(ts, method, path, raw),
      },
      body: raw || undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { ok: false, error: "bad_json_from_bot", raw: text.slice(0, 200) };
    }
    return { status: r.status, json };
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("bot api timeout");
      err.code = "bot_timeout";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { botFetch, configured };
