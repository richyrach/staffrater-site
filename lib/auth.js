// /lib/auth.js
"use strict";
const crypto = require("crypto");

const SECRET = process.env.SESSION_SECRET || "dev-secret";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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
    const expected = sign(json);
    if (sig !== expected) return null;
    const obj = JSON.parse(json);
    if (!obj || !obj.t || Date.now() - obj.t > STATE_TTL_MS) return null;
    if (typeof obj.ret !== "string" || !obj.ret.startsWith("/")) obj.ret = "/";
    return obj;
  } catch {
    return null;
  }
}

function issueSessionToken(sessionObj) {
  const payload = JSON.stringify({ ...sessionObj, exp: Date.now() + TOKEN_TTL_MS });
  const data = b64urlEncode(payload);
  const sig = sign(payload);
  return `${data}.${sig}`;
}
function verifySessionToken(token) {
  try {
    const [data, sig] = (token || "").split(".");
    if (!data || !sig) return null;
    const json = b64urlDecodeToString(data);
    const expected = sign(json);
    if (sig !== expected) return null;
    const obj = JSON.parse(json);
    if (!obj || !obj.exp || Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  try {
    const full = new URL(req.url, `https://${req.headers.host}`);
    const t = full.searchParams.get("token");
    if (t) return t;
  } catch {}
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

module.exports = {
  issueState, parseState,
  issueSessionToken, verifySessionToken,
  getSessionFromReq
};
