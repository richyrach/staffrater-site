const { createHmac } = require("crypto");

function parseCookies(req){ const h=req.headers.cookie||""; const o={}; h.split(";").forEach(p=>{const i=p.indexOf("="); if(i>-1)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}); return o; }
function verify(payload, sig, secret){ const expected=createHmac("sha256", secret).update(payload).digest("base64url"); return expected===sig; }

async function userGuilds(access_token){
  const r = await fetch("https://discord.com/api/users/@me/guilds", { headers:{Authorization:`Bearer ${access_token}`}});
  if(!r.ok) return null; return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; return res.end("POST only"); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const guild_id = url.searchParams.get("guild_id");
  if(!guild_id){ res.statusCode=400; return res.end("guild_id required"); }

  const cookies = parseCookies(req);
  const raw = cookies["sr_auth"];
  if(!raw || !raw.includes(".")){ res.statusCode=401; return res.end("no session"); }
  const [payload,sig] = raw.split(".");
  if(!verify(payload,sig,process.env.SESSION_SECRET)){ res.statusCode=401; return res.end("bad signature"); }
  const auth = JSON.parse(Buffer.from(payload,"base64url").toString());

  const guilds = await userGuilds(auth.access_token);
  if(!guilds){ res.statusCode=401; return res.end("token invalid"); }
  const g = guilds.find(x=>x.id===guild_id);
  const ADMIN=0x8, MANAGE_GUILD=0x20;
  const can = g && (g.owner || (g.permissions & ADMIN)===ADMIN || (g.permissions & MANAGE_GUILD)===MANAGE_GUILD);
  if(!can){ res.statusCode=403; return res.end("forbidden"); }

  // read body
  const buf = await new Promise(r=>{ let b=""; req.on("data",d=>b+=d); req.on("end",()=>r(b)); });
  let incoming = {};
  try { incoming = JSON.parse(buf || "{}"); } catch {}

  // keep only known keys as strings
  const cfg = {
    rating_channel: incoming.rating_channel || "",
    result_channel: incoming.result_channel || "",
    ticket_category: incoming.ticket_category || "",
    ticket_staff_role: incoming.ticket_staff_role || "",
    ticket_log_channel: incoming.ticket_log_channel || ""
  };

  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  await fetch(`${base}/set/cfg:${guild_id}/${encodeURIComponent(JSON.stringify(cfg))}`, { method:"POST", headers:{Authorization:`Bearer ${token}`} });

  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify({ ok:true }));
};
