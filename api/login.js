const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";

module.exports = async (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    prompt: "none"
  });
  res.statusCode = 302;
  res.setHeader("Location", `${AUTHORIZE_URL}?${params.toString()}`);
  res.end();
};
