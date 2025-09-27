"use strict";
/**
 * GET /api/config-get?guild_id=...
 * Returns the stored config for a guild from Redis.
 * Auth:
 *  - Must be logged in.
 *  - Must be in the guild and have Admin or Manage Server (checked via BOT token).
 */

const { getSessionFromReq } = require("../lib/auth");

const PERM_ADMIN = 0x00000008;
const PERM_MANAGE_GUILD = 0x00000020;

// Accept both env names
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

async function redis(cmd, args=[]) {
  if (!UP_URL || !UP_TOKEN) {
    const e = new Error("missing_upstash_env");
    e.code = "missing_upstash_env";
    throw e;
  }
  const r = await fetch(UP_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${UP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cmd, args })
  });
  if (!r.ok) throw new Error("upstash_http_" + r.status);
  return r.json(); // { result: ... }
}

function tupleArrayToObject(arr) {
  // Upstash sometimes returns [["field","value"], ...]
  const obj = {};
  for (const t of arr || []) {
    if (Array.isArray(t) && t.length >= 2) obj[String(t[0])] = String(t[1]);
  }
  return obj;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  try {
    const base = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
    const url = new URL(req.url, base);
    const guildId = url.searchParams.get("guild_id");
    if (!guildId) { res.statusCode = 400; return res.end(JSON.stringify({ ok:false, error:"missing_guild_id" })); }

    const session = getSessionFromReq(req);
    if (!session || !session.user || !session.user.id) {
      res.statusCode = 401; return res.end(JSON.stringify({ ok:false, error:"no_session" }));
    }
    if (!BOT_TOKEN) {
      res.statusCode = 500; return res.end(JSON.stringify({ ok:false, error:"missing_bot_token" }));
    }

    const userId = session.user.id;

    // Fetch guild & roles
    const gR = await fetch(`https://discord.com/api/guilds/${guildId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    if (!gR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_guild_failed" })); }
    const guild = await gR.json();

    const rolesR = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    if (!rolesR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_roles_failed" })); }
    const rolesRaw = await rolesR.json();
    const roleMap = new Map(rolesRaw.map(r => [String(r.id), r]));

    // Member perms
    const mR = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    if (mR.status === 404) { res.statusCode=403; return res.end(JSON.stringify({ ok:false, error:"not_in_guild" })); }
    if (!mR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_member_failed" })); }
    const member = await mR.json();

    if (String(guild.owner_id) !== String(userId)) {
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

    // Read from Redis
    const key = `guild:${guildId}:config`;
    const out = await redis("HGETALL", [key]);
    // Upstash may return { result: null } or [] if empty
    let result = out?.result || null;
    if (!result) result = {};
    else if (Array.isArray(result)) result = tupleArrayToObject(result);

    res.statusCode = 200;
    res.end(JSON.stringify(result)); // plain object (not wrapped in ok:true)
  } catch (e) {
    const code = e && e.code ? e.code : "server_error";
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error: code }));
  }
};
