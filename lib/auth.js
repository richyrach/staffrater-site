// /lib/auth.js
"use strict";
const crypto = require("crypto");

// No fallback on purpose: this repo is public, so a default secret would let
// anyone forge a session for any Discord user. Fail loudly at boot instead.
const SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET === "dev-secret") {
  throw new Error(
    "SESSION_SECRET is missing (or still the old dev default). Set it in the Vercel project env."
  );
}
if (SECRET.length < 32) {
  // Not fatal — refusing to boot here would take a live site down — but a short
  // secret is brute-forceable, so make it loud in the function logs.
  console.error("WARNING: SESSION_SECRET is shorter than 32 chars. Regenerate it: openssl rand -base64 48");
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 min
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Key for encrypting the Discord access token we carry inside the session.
const AT_KEY = crypto.createHash("sha256").update(`${SECRET}:at`).digest();

function b64urlEncode(strUtf8) {
  return Buffer.from(strUtf8, "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecodeToString(b64url) {
  return Buffer.from(b64url.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function sign(strUtf8) {
  return crypto.createHmac("sha256", SECRET)
    .update(strUtf8)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// The Discord access token must not be readable by anyone who gets hold of the
// session token — signing alone leaves it as plain base64. Encrypt it.
function encryptAT(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", AT_KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
function decryptAT(packed) {
  try {
    const [iv, tag, enc] = String(packed || "").split(".");
    if (!iv || !tag || !enc) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", AT_KEY, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function issueState(returnTo) {
  const payload = JSON.stringify({ t: Date.now(), ret: returnTo || "/" });
  const data = b64urlEncode(payload);
  const sig = sign(payload);
  return `${data}.${sig}`;
}
function parseState(stateStr) {
  try {
    const [data, sig] = (stateStr || "").split(".");
    if (!data || !sig) return null;
    const json = b64urlDecodeToString(data);
    if (!safeEqual(sig, sign(json))) return null;
    const obj = JSON.parse(json);
    if (!obj || !obj.t || Date.now() - obj.t > STATE_TTL_MS) return null;
    if (typeof obj.ret !== "string" || !obj.ret.startsWith("/")) obj.ret = "/";
    return obj;
  } catch {
    return null;
  }
}

function issueSessionToken(sessionObj) {
  const { at, ...rest } = sessionObj || {};
  const payload = JSON.stringify({
    ...rest,
    at: encryptAT(at), // stored encrypted, never readable from the token itself
    exp: (sessionObj && sessionObj.exp) || Date.now() + TOKEN_TTL_MS,
  });
  const data = b64urlEncode(payload);
  const sig = sign(payload);
  return `${data}.${sig}`;
}
function verifySessionToken(token) {
  try {
    const [data, sig] = (token || "").split(".");
    if (!data || !sig) return null;
    const json = b64urlDecodeToString(data);
    if (!safeEqual(sig, sign(json))) return null;
    const obj = JSON.parse(json);
    if (!obj || !obj.exp || Date.now() > obj.exp) return null;
    if (obj.at) obj.at = decryptAT(obj.at);
    return obj;
  } catch {
    return null;
  }
}

function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  // Deliberately NOT reading ?token= — session tokens in query strings leak via
  // Referer headers, browser history and proxy/CDN logs.
  const raw = req.headers.cookie || "";
  const m = raw.match(/(?:^|;\s*)sr_session=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

function getSessionFromReq(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  return verifySessionToken(token);
}

// --- Discord guild permission checks -----------------------------------
// Discord returns `permissions` as a decimal STRING of a value well past 2^31,
// so JS bitwise ops (which truncate to 32 bits) give wrong answers. Use BigInt.
const PERM_ADMIN = 1n << 3n;
const PERM_MANAGE_GUILD = 1n << 5n;

function canManageGuild(g) {
  if (!g) return false;
  if (g.owner === true) return true;
  let p;
  try {
    p = BigInt(g.permissions ?? 0);
  } catch {
    return false;
  }
  return (p & PERM_ADMIN) === PERM_ADMIN || (p & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
}

async function fetchUserGuilds(session) {
  if (!session || !session.at) return null;
  const r = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${session.at}` },
  });
  if (!r.ok) return null;
  return r.json();
}

// Authoritative server-side check: does this session actually manage that guild?
async function userManagesGuild(session, guildId) {
  const guilds = await fetchUserGuilds(session);
  if (!Array.isArray(guilds)) return false;
  return canManageGuild(guilds.find((g) => String(g.id) === String(guildId)));
}

module.exports = {
  issueState, parseState,
  issueSessionToken, verifySessionToken,
  getSessionFromReq,
  canManageGuild, fetchUserGuilds, userManagesGuild
};
