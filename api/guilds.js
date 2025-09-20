const { createHmac } = require("crypto");
const GUILDS_URL = "https://discord.com/api/users/@me/guilds";

function parseCookies(req) {
  const h = req.headers.cookie || ""; const out = {};
  h.split(";").forEach(p => { const i = p.indexOf("="); if(i>-1) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1)); });
  return out;
}
function verify(payload, sig, secret) {
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  return expected === sig;
}
function iconUrl(g) { return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null; }

module.exports = async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const raw = cookies["sr_auth"];
    if (!raw || !raw.includes(".")) { res.statusCode = 401; return res.end("no session"); }
    const [payload, sig] = raw.split(".");
    if (!verify(payload, sig, process.env.SESSION_SECRET)) { res.statusCode = 401; return res.end("bad signature"); }
    const auth = JSON.parse(Buffer.from(payload, "base64url").toString());

    const r = await fetch(GUILDS_URL, { headers: { Authorization: `Bearer ${auth.access_token}` }});
    if (!r.ok) { res.statusCode = 401; return res.end("token invalid"); }
    const guilds = await r.json(); // array

    // perms bit flags
    const ADMIN = 0x8;           // Administrator
    const MANAGE_GUILD = 0x20;   // Manage Server

    const out = guilds.map(g => ({
      id: g.id, name: g.name, icon: iconUrl(g),
      canManage: ((g.permissions & ADMIN) === ADMIN) || ((g.permissions & MANAGE_GUILD) === MANAGE_GUILD) || g.owner === true
    }));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 500; res.end("error");
  }
};
