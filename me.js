const { createHmac } = require("crypto");

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}
function verify(payload, sig, secret) {
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  return expected === sig;
}
function avatarUrl(id, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
  const n = (BigInt(id) >> 22n) % 6n; // snowflake-based default
  return `https://cdn.discordapp.com/embed/avatars/${Number(n)}.png`;
}

module.exports = async (req, res) => {
  const cookies = parseCookies(req);
  const raw = cookies["sr_session"];
  if (!raw || !raw.includes(".")) {
    res.statusCode = 401; return res.end("no session");
  }
  const [payload, sig] = raw.split(".");
  if (!verify(payload, sig, process.env.SESSION_SECRET)) {
    res.statusCode = 401; return res.end("bad signature");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    id: data.id,
    username: data.username,
    global_name: data.global_name,
    avatar: avatarUrl(data.id, data.avatar)
  }));
};
