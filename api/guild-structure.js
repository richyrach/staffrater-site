"use strict";
/**
 * /api/guild-structure?guild_id=...
 *
 * Robust version:
 * - Reads user session (id from our small token).
 * - Uses BOT token to:
 *    a) verify the user is a member of the guild,
 *    b) compute their permissions from roles,
 *    c) if Admin or Manage Server -> return channels/roles/categories (by name).
 *
 * Returns (on success):
 * {
 *   ok: true,
 *   channels: [{id,name,type,position,parent_id?}, ...],
 *   roles:    [{id,name,position}, ...],
 *   categories:[{id,name,type:4,position}, ...]
 * }
 */

const { getSessionFromReq } = require("../lib/auth");

const PERM_ADMIN = 0x00000008;        // ADMINISTRATOR
const PERM_MANAGE_GUILD = 0x00000020; // MANAGE_GUILD

function toBigInt(x) {
  try { return BigInt(String(x)); } catch { return 0n; }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  try {
    const base = process.env.SITE_BASE_URL || "https://www.staffrater.xyz";
    const url = new URL(req.url, base);
    const guildId = url.searchParams.get("guild_id");

    if (!guildId) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:"missing_guild_id" }));
    }

    const session = getSessionFromReq(req);
    if (!session || !session.user || !session.user.id) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok:false, error:"no_session" }));
    }

    const userId = session.user.id;
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok:false, error:"missing_bot_token" }));
    }

    // --- Fetch guild (for owner_id and sanity) ---
    const gR = await fetch(`https://discord.com/api/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!gR.ok) {
      const t = await gR.text().catch(()=> "");
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok:false, error:"discord_guild_failed", detail:t || gR.status }));
    }
    const guild = await gR.json(); // { id, name, owner_id, ... }

    // --- Fetch roles (we’ll need them to compute member perms) ---
    const rolesR = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!rolesR.ok) {
      const t = await rolesR.text().catch(()=> "");
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok:false, error:"discord_roles_failed", detail:t || rolesR.status }));
    }
    const rolesRaw = await rolesR.json();

    // Map roles by id and keep sorted copy for return later
    const roleMap = new Map();
    for (const r of rolesRaw) roleMap.set(String(r.id), r);

    const roles = rolesRaw
      .map(r => ({ id: r.id, name: r.name, position: typeof r.position === "number" ? r.position : 0 }))
      .sort((a,b) => b.position - a.position || a.name.localeCompare(b.name));

    // --- Fetch member (verify membership & compute perms) ---
    const mR = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    if (mR.status === 404) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok:false, error:"not_in_guild" }));
    }
    if (!mR.ok) {
      const t = await mR.text().catch(()=> "");
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok:false, error:"discord_member_failed", detail:t || mR.status }));
    }

    const member = await mR.json(); // { user, roles:[roleId,...], ... }

    // Owner shortcut:
    if (String(guild.owner_id) !== String(userId)) {
      // Compute permissions from @everyone + member roles
      // The @everyone role in Discord has id == guild.id
      let permBits = toBigInt((roleMap.get(String(guildId))?.permissions) || "0");

      for (const rid of (member.roles || [])) {
        const r = roleMap.get(String(rid));
        if (r && typeof r.permissions !== "undefined") {
          permBits |= toBigInt(r.permissions);
        }
      }

      const hasAdmin = (permBits & BigInt(PERM_ADMIN)) !== 0n;
      const hasManageGuild = (permBits & BigInt(PERM_MANAGE_GUILD)) !== 0n;

      if (!hasAdmin && !hasManageGuild) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok:false, error:"insufficient_permissions" }));
      }
    }
    // else: user is owner => allowed

    // --- Fetch channels for the guild ---
    const chR = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!chR.ok) {
      const t = await chR.text().catch(()=> "");
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok:false, error:"discord_channels_failed", detail:t || chR.status }));
    }
    const chRaw = await chR.json();

    const channels = (Array.isArray(chRaw) ? chRaw : [])
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,                       // 0=text, 2=voice, 4=category, etc.
        position: typeof c.position === "number" ? c.position : 0,
        parent_id: c.parent_id || null
      }))
      .sort((a,b) => a.position - b.position || a.name.localeCompare(b.name));

    const categories = channels.filter(c => c.type === 4);

    // Done
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok:true, channels, roles, categories }));

  } catch (e) {
    console.error("guild-structure crash:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error:"server_error" }));
  }
};
