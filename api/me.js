// /api/me.js
import crypto from "crypto";

function decode(token) {
  try {
    const [b64, sig] = (token || "").split(".");
    if (!b64 || !sig) return null;
    const json = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const expect = crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev-secret")
      .update(json).digest("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    if (sig !== expect) return null;
    return JSON.parse(json);
  } catch { return null; }
}

export default async function handler(req, res) {
  try {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)sr_session=([^;]+)/);
    const raw = m ? decodeURIComponent(m[1]) : null;
    const session = raw ? decode(raw) : null;
    if (!session) return res.status(401).json({ ok: false });
    res.status(200).json({ ok: true, session });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
}
