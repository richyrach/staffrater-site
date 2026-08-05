import { Redis } from '@upstash/redis';

// Use the same keys as stats-set.js
const KEY = 'sr:public:stats:latest';
const KEY_TOP = 'sr:public:stats:top_guilds';

// Redis.fromEnv() throws if the Upstash env vars are missing. Doing that at module
// scope crashed the whole function with FUNCTION_INVOCATION_FAILED (a hard 500 on
// every request). Build the client lazily and report the misconfiguration instead.
let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const EMPTY = {
  guilds: null,
  total_ratings: null,
  avg_rating: null,
  tickets_open: null,
  tickets_closed: null,
  apps_total: null,
  cmds_24h: null,
  ts: null,
  top_guilds: [],
};

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    // Not configured yet — say so plainly rather than 500-ing.
    return res.status(200).json({
      ok: false,
      error: 'not_configured',
      note: 'Upstash env vars are not set on this deployment.',
      ...EMPTY,
    });
  }

  try {
    const latest = await redis.get(KEY);
    const topGuilds = (await redis.get(KEY_TOP)) || [];

    if (!latest) {
      return res.status(200).json({
        ok: true,
        ...EMPTY,
        note: 'No stats yet. Wait for the bot to push /api/stats-set.',
      });
    }

    return res.status(200).json({
      ok: true,
      ...latest,
      top_guilds: topGuilds,
    });
  } catch (e) {
    console.error('stats-get error:', e);
    return res.status(500).json({ ok: false, error: 'server_error', ...EMPTY });
  }
}
