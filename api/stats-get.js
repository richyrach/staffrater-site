import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  try {
    // The bot (via /api/stats-set) should write the latest snapshot here:
    const latest = await kv.get("sr:stats:latest");

    // Optional: top guild list (if you write it)
    const topGuilds = (await kv.get("sr:stats:top_guilds")) || [];

    if (!latest) {
      return res.status(200).json({
        ok: true,
        guilds: 0,
        total_ratings: 0,
        avg_rating: 0,
        tickets_open: 0,
        tickets_closed: 0,
        apps_total: 0,
        cmds_24h: 0,
        ts: null,
        top_guilds: [],
        note: "No stats yet. Wait for the bot to push /api/stats-set.",
      });
    }

    return res.status(200).json({
      ok: true,
      ...latest,
      top_guilds: topGuilds,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
