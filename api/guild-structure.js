const { createHmac } = require("crypto");

function parseCookies(req){ const h=req.headers.cookie||""; const o={}; h.split(";").forEach(p=>{const i=p.indexOf("="); if(i>-1)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}); return o; }
function verify(payload, sig, secret){ const expected=createHmac("sha256", secret).update(payload).digest("base64url"); return expected===sig; }
async function userGuilds(token){
  const r = await fetch("https://discord.com/api/users/@me/guilds", { headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok) return null; return r.json();
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const gid = url.searchParams.get("guild_id");
    if(!gid){ res.statusCode=400; return res.end("guild_id required"); }

    // authenticate website user
    const cookies = parseCookies(req);
    const raw = cookies["sr_auth"];
    if(!raw || !raw.includes(".")){ res.statusCode=401; return res.end("no session"); }
    const [payload,sig] = raw.split(".");
    if(!verify(payload,sig,process.env.SESSION_SECRET)){ res.statusCode=401; return res.end("bad signature"); }
    const auth = JSON.parse(Buffer.from(payload,"base64url").toString());

    // ensure user can manage that guild
    const glist = await userGuilds(auth.access_token);
    if(!glist){ res.statusCode=401; return res.end("token invalid"); }
    const g = glist.find(x=>x.id===gid);
    const ADMIN=0x8, MANAGE_GUILD=0x20;
    const can = g && (g.owner || (g.permissions & ADMIN)===ADMIN || (g.permissions & MANAGE_GUILD)===MANAGE_GUILD);
    if(!can){ res.statusCode=403; return res.end("forbidden"); }

    // fetch via bot token (bot must be in guild)
    const BOT = process.env.DISCORD_BOT_TOKEN;
    const base = "https://discord.com/api";
    const headers = { "Authorization": `Bot ${BOT}` };

    // guild channels
    const cr = await fetch(`${base}/guilds/${gid}/channels`, { headers });
    if (cr.status === 403 || cr.status === 404) { res.statusCode=403; return res.end("bot not in guild"); }
    if (!cr.ok) { res.statusCode=500; return res.end("channels error"); }
    const channels = await cr.json();

    // guild roles
    const rr = await fetch(`${base}/guilds/${gid}/roles`, { headers });
    if(!rr.ok) { res.statusCode=500; return res.end("roles error"); }
    const roles = await rr.json();

    // shape
    const TEXT = 0, CATEGORY = 4;
    const textChannels = channels.filter(c=>c.type===TEXT).map(c=>({ id:c.id, name:c.name }));
    const categories   = channels.filter(c=>c.type===CATEGORY).map(c=>({ id:c.id, name:c.name }));
    const roleList     = roles.filter(r=>!r.managed).map(r=>({ id:r.id, name:r.name })).sort((a,b)=>a.name.localeCompare(b.name));

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ channels: textChannels, categories, roles: roleList }));
  } catch (e) {
    res.statusCode = 500; res.end("error");
  }
};
