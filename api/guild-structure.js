"use strict";
/**
 * /api/guild-structure?guild_id=...
 *
 * Returns:
 * {
 *   channels: [{id,name,type,position,parent_id?}, ...],
 *   roles:    [{id,name,position}, ...],
 *   categories:[{id,name,type:4,position}, ...]
 * }
 *
 * Auth:
 * - Verifies logged-in user session (via lib/auth).
 * - Confirms the user is in the guild and has ADMINISTRATOR or MANAGE_GUILD.
 * - Uses BOT_TOKEN to fetch guild channels & roles (user tokens cannot).
 */

const { getSessionFromReq } = require("../lib/auth");

// Discord permission bits we care about
const PERM_ADMIN = 0x00000008;       // ADMINISTRATOR
const PERM_MANAGE_GUILD = 0x00000020; // MANAGE_GUILD

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  try {
    // 1) Parse query
    const url = new URL(req.url, process.env.SITE_BASE_URL || "https://www.staffrater.xyz");
    const guildId = url.searchParams.get("guild_id");
    if (!guildId) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: "missing_guild_id" }));
    }

    // 2) Check session (must be logged in)
    const session = getSessionFromReq(req);
    if (!session || !session.at || !session.user) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "no_session" }));
    }

    // 3) Verify the user actually belongs to this guild & has rights
    //    Use the *user's OAuth token* to list their guilds.
    const meGuildsResp = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${session.at}` }
    });

    if (meGuildsResp.status === 401 || meGuildsResp.status === 403) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: "expired_session" }));
    }
    if (!meGuildsResp.ok) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok: false, error: "discord_me_guilds_failed" }));
    }

    const myGuilds = await meGuildsResp.json();
    const match = Array.isArray(myGuilds) ? myGuilds.find(g => g.id === guildId) : null;
    if (!match) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok: false, error: "not_in_guild" }));
    }

    // permissions is a string bitfield from Discord; check admin or manage_guild
    // Use BigInt to be safe on large bitfields.
    const permsStr = match.permissions || "0";
    const perms = BigInt(permsStr);
    const hasAdmin = (perms & BigInt(PERM_ADMIN)) !== 0n;
    const hasManageGuild = (perms & BigInt(PERM_MANAGE_GUILD)) !== 0n;
    if (!hasAdmin && !hasManageGuild) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok: false, error: "insufficient_permissions" }));
    }

    // 4) Use BOT_TOKEN to fetch structure (channels/roles)
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: "missing_bot_token" }));
    }

    // Channels
    const chResp = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!chResp.ok) {
      const t = await chResp.text().catch(() => "");
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok: false, error: "discord_channels_failed", detail: t }));
    }
    const chRaw = await chResp.json();

    // Roles
    const rResp = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!rResp.ok) {
      const t = await rResp.text().catch(() => "");
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok: false, error: "discord_roles_failed", detail: t }));
    }
    const rRaw = await rResp.json();

    // 5) Shape & sort
    const channels = (Array.isArray(chRaw) ? chRaw : []).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      position: typeof c.position === "number" ? c.position : 0,
      parent_id: c.parent_id || null
    })).sort((a,b) => a.position - b.position || a.name.localeCompare(b.name));

    const roles = (Array.isArray(rRaw) ? rRaw : []).map(r => ({
      id: r.id,
      name: r.name,
      position: typeof r.position === "number" ? r.position : 0
    })).sort((a,b) => b.position - a.position || a.name.localeCompare(b.name));

    const categories = channels.filter(c => c.type === 4);

    // 6) Done
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, channels, roles, categories }));
  } catch (e) {
    console.error("guild-structure crash:", e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "server_error" }));
  }
};
