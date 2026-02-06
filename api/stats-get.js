import { Redis } from '@upstash/redis';

// Use the same keys as stats-set.js
const redis = Redis.fromEnv();
const KEY = 'sr:public:stats:latest';
const KEY_TOP = 'sr:public:stats:top_guilds';

export default async function handler(req, res) {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).end('Method Not Allowed');
    }

    // Read the latest stats snapshot
    const latest = await redis.get(KEY);
    const topGuilds = (await redis.get(KEY_TOP)) || [];

    if (!latest) {
      // If nothing has been written yet, return zeros
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
        note: 'No stats yet. Wait for the bot to push /api/stats-set.',
      });
    }

    return res.status(200).json({
      ok: true,
      ...latest,
      top_guilds: topGuilds,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}
