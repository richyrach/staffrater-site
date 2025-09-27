"use strict";
/**
 * POST /api/config-set
 * Body JSON any of:
 * {
 *   guild_id: "123",
 *   rating_channel_id: "...",
 *   result_channel_id: "...",
 *   ticket_category_id: "...",
 *   ticket_staff_role_id: "...",
 *   ticket_log_channel_id: "..." | null
 * }
 *
 * Auth:
 *  - Must be logged in.
 *  - Must be in guild with Admin or Manage Server (checked via BOT token).
 * Writes to Upstash Hash: guild:{guild_id}:config
 */

const { getSessionFromReq } = require("../lib/auth");

const PERM_ADMIN = 0x00000008;
const PERM_MANAGE_GUILD = 0x00000020;

const BOT_TOKEN =
  process.env.BOT_TOKEN ||
  process.env.DISCORD_BOT_TOKEN ||
  process.env.BOT_SECRET;

const UP_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_URL;

const UP_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_TOKEN;

function toBigInt(x){ try { return BigInt(String(x)); } catch { return 0n; } }

// ---- Upstash helper using URL path style ----
// Example: GET ${UP_URL}/hset/guild:123:config/field/value/field2/value2
async function redisPath(cmd, args = []) {
  if (!UP_URL || !UP_TOKEN) {
    const e = new Error("missing_upstash_env");
    e.code = "missing_upstash_env";
    throw e;
  }
  const url = `${UP_URL}/${cmd}/${args.map(a => encodeURIComponent(String(a))).join("/")}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${UP_TOKEN}` } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) {
    const e = new Error((j && j.error) || `upstash_${cmd}_failed`);
    e.code = (j && j.error) || `upstash_${cmd}_failed`;
    throw e;
  }
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:"method_not_allowed" }));
    }

    const session = getSessionFromReq(req);
    if (!session || !session.user || !session.user.id) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok:false, error:"no_session" }));
    }
    if (!BOT_TOKEN) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok:false, error:"missing_bot_token" }));
    }

    // Body
    let body = {};
    try {
      const text = await new Promise((resolve, reject)=>{
        let b=""; req.on("data", c=> b+=c); req.on("end", ()=> resolve(b)); req.on("error", reject);
      });
      body = text ? JSON.parse(text) : {};
    } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:"invalid_json" }));
    }

    const guildId = String(body.guild_id || "");
    if (!guildId) { res.statusCode=400; return res.end(JSON.stringify({ ok:false, error:"missing_guild_id" })); }

    // Permission check
    const gR = await fetch(`https://discord.com/api/guilds/${guildId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    if (!gR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_guild_failed" })); }
    const guild = await gR.json();

    const rolesR = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    if (!rolesR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_roles_failed" })); }
    const rolesRaw = await rolesR.json();
    const roleMap = new Map(rolesRaw.map(r => [String(r.id), r]));

    const mR = await fetch(`https://discord.com/api/guilds/${guildId}/members/${session.user.id}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    if (mR.status === 404) { res.statusCode=403; return res.end(JSON.stringify({ ok:false, error:"not_in_guild" })); }
    if (!mR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_member_failed" })); }
    const member = await mR.json();

    if (String(guild.owner_id) !== String(session.user.id)) {
      let permBits = toBigInt((roleMap.get(String(guildId))?.permissions)||"0"); // @everyone
      for (const rid of (member.roles||[])) {
        const r = roleMap.get(String(rid));
        if (r && r.permissions != null) permBits |= toBigInt(r.permissions);
      }
      const hasAdmin = (permBits & BigInt(PERM_ADMIN)) !== 0n;
      const hasManage = (permBits & BigInt(PERM_MANAGE_GUILD)) !== 0n;
      if (!hasAdmin && !hasManage) {
        res.statusCode=403; return res.end(JSON.stringify({ ok:false, error:"insufficient_permissions" }));
      }
    }

    const key = `guild:${guildId}:config`;
    const fields = [
      ["rating_channel",       body.rating_channel_id],
      ["result_channel",       body.result_channel_id],
      ["ticket_category",      body.ticket_category_id],
      ["ticket_staff_role",    body.ticket_staff_role_id],
      ["ticket_log_channel",  (body.ticket_log_channel_id ?? "")]
    ].filter(([,v]) => typeof v !== "undefined");

    if (!fields.length) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:"no_fields_to_set" }));
    }

    const flat = [];
    for (const [f, v] of fields) flat.push(f, (v == null ? "" : String(v)));

    // HSET key field value [field value ...]
    await redisPath("hset", [key, ...flat]);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok:true }));
  } catch (e) {
    const code = e && e.code ? e.code : "server_error";
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error: code }));
  }
};
