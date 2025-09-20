module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const gid = url.searchParams.get("guild_id");
    const secret = url.searchParams.get("secret");
    if (!gid || !secret) { res.statusCode = 400; return res.end("guild_id & secret required"); }
    if (secret !== process.env.DASHBOARD_SHARED_SECRET) { res.statusCode = 403; return res.end("forbidden"); }

    // read body (one log entry)
    const body = await new Promise(r => { let b=""; req.on("data",d=>b+=d); req.on("end",()=>r(b)); });
    let entry = {};
    try { entry = JSON.parse(body || "{}"); } catch {}
    entry.ts = Date.now();

    // fetch current list
    const base = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const headers = { Authorization: `Bearer ${token}` };

    const r = await fetch(`${base}/get/log:${gid}`, { headers });
    const data = await r.json();
    const list = data && data.result ? JSON.parse(data.result) : [];

    // keep newest first, max 200
    list.unshift(entry);
    if (list.length > 200) list.length = 200;

    await fetch(`${base}/set/log:${gid}/${encodeURIComponent(JSON.stringify(list))}`, { method: "POST", headers });
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({ ok:true }));
  } catch (e) {
    res.statusCode = 500; res.end("error");
  }
};
