"use strict";

// /api/logout.js
module.exports = async (req, res) => {
  try {
    const host = req.headers.host || "www.staffrater.xyz";
    const baseDomain = host.replace(/^www\./, "");
    const domainAttr = `Domain=.${baseDomain}`;

    res.setHeader(
      "Set-Cookie",
      `sr_session=; ${domainAttr}; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
    );

    const full = new URL(req.url, `https://${host}`);
    const redirect = full.searchParams.get("redirect") || "/";
    const to = redirect.startsWith("/") ? redirect : "/";
    res.writeHead(302, { Location: to });
    res.end();
  } catch (e) {
    console.error("Logout crash:", e);
    res.statusCode = 500;
    res.end("logout_failed");
  }
};
