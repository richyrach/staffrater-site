// /api/me.js
const kvUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

import crypto from "crypto";
function unsign(token) {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  const [b64, sig] = (token || "").split(".");
  if (!b64 || !sig) return null;
  const json = Buffer.from(b64.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(json).digest("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  if (sig !== expected) return null;
  try { return JSON.parse(json); } catch { return null; }
}

export default async function handler(req, res) {
  try {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)sr_session=([^;]+)/);
    const raw = m ? decodeURIComponent(m[1]) : null;
    if (!raw) return res.status(401).json({ ok: false });

    // KV session?
    if (kvUrl && kvToken && raw.length === 32) {
      const key = `sr:sessions:${raw}`;
      const getUrl = `${kvUrl.replace(/\/$/,"")}/get/${encodeURIComponent(key)}`;
      const r = await fetch(getUrl, { headers: { Authorization: `Bearer ${kvToken}` }});
      const j = await r.json().catch(() => ({}));
      const value = j.result || j.value;
      if (!value) return res.status(401).json({ ok: false });
      const session = typeof value === "string" ? JSON.parse(value) : value;
      return res.status(200).json({ ok: true, session });
    }

    // Cookie-only session
    const session = unsign(raw);
    if (!session) return res.status(401).json({ ok: false });
    res.status(200).json({ ok: true, session });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
}
