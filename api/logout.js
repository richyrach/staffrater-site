module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", "sr_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  res.statusCode = 302;
  res.setHeader("Location", "/?logged=0");
  res.end();
};
