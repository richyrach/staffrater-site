import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const KEY = "sr:public:stats:latest";

// Optional: protect POST with a secret (recommended)
const PUSH_SECRET = process.env.STATS_PUSH_SECRET;

export default async function handler(req, res) {
  try {
    // Public read
    if (req.method === "GET") {
      const data = await redis.get(KEY);
      return res.status(200).json({ ok: true, data: data || null });
    }

    // Bot write
    if (req.method === "POST") {
      if (PUSH_SECRET) {
        const auth = req.headers["authorization"] || "";
        if (auth !== `Bearer ${PUSH_SECRET}`) {
          return res.status(401).json({ ok: false, error: "unauthorized" });
        }
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const payload = {
        guilds: Number(body.guilds || 0),
        total_ratings: Number(body.total_ratings || 0),
        avg_rating: Number(body.avg_rating || 0),
        tickets_open: Number(body.tickets_open || 0),
        tickets_closed: Number(body.tickets_closed || 0),
        apps_total: Number(body.apps_total || 0),
        cmds_24h: Number(body.cmds_24h || 0),
        ts: body.ts || new Date().toISOString(),
      };

      await redis.set(KEY, payload);
      await redis.expire(KEY, 60 * 60 * 6); // 6 hours TTL
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  } catch (e) {
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
