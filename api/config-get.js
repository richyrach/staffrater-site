"use strict";
/**
 * GET /api/config-get?guild_id=...
 * Returns the stored config for a guild from Upstash Redis (HGETALL).
 * Auth:
 *  - Must be logged in.
 *  - Must be in the guild and have Admin or Manage Server (checked via BOT token).
 */

const { getSessionFromReq } = require("../lib/auth");

const PERM_ADMIN = 0x00000008;
const PERM_MANAGE_GUILD = 0x00000020;

// Accept both names for your bot token
const BOT_TOKEN =
  process.env.BOT_TOKEN ||
  process.env.DISCORD_BOT_TOKEN ||
  process.env.BOT_SECRET;

// Upstash REST envs
const UP_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_URL;

const UP_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_TOKEN;

function toBigInt(x){ try { return BigInt(String(x)); } catch { return 0n; } }

// ---- Upstash helper using URL path style ----
// Example: GET ${UP_URL}/hgetall/guild:123:config
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

function tupleArrayToObject(arr) {
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

    // Guild & roles (for permission calc)
    const gR = await fetch(`https://discord.com/api/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!gR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_guild_failed" })); }
    const guild = await gR.json();

    const rolesR = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!rolesR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_roles_failed" })); }
    const rolesRaw = await rolesR.json();
    const roleMap = new Map(rolesRaw.map(r => [String(r.id), r]));

    // Member
    const mR = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (mR.status === 404) { res.statusCode=403; return res.end(JSON.stringify({ ok:false, error:"not_in_guild" })); }
    if (!mR.ok) { res.statusCode=502; return res.end(JSON.stringify({ ok:false, error:"discord_member_failed" })); }
    const member = await mR.json();

    // Permissions: owner OR (ADMINISTRATOR | MANAGE_GUILD)
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

    // Read HGETALL
    const key = `guild:${guildId}:config`;
    let result = await redisPath("hgetall", [key]);
    // Normalize to object
    if (Array.isArray(result)) result = tupleArrayToObject(result);
    if (!result || typeof result !== "object") result = {};

    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (e) {
    const code = e && e.code ? e.code : "server_error";
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error: code }));
  }
};
