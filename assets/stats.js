(() => {
  const nodes = [...document.querySelectorAll("[data-public-stat]")], status = document.getElementById("stats-status"), button = document.getElementById("stats-refresh");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
  async function load() {
    button.disabled = true; button.textContent = "Refreshing…"; status.textContent = "Loading the latest snapshot…";
    nodes.forEach(node => node.classList.add("loading-number"));
    try {
      const response = await fetch("/api/stats-get", {cache:"no-store",signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (!payload.ok) throw new Error("unavailable");
      const stats = payload.data || payload;
      const values = {guilds:stats.guilds ?? stats.servers,total_ratings:stats.total_ratings ?? stats.ratings,cmds_24h:stats.cmds_24h ?? stats.commands_24h};
      nodes.forEach(node => node.textContent = number(values[node.dataset.publicStat]));
      const stamp = stats.updated_at || stats.ts;
      const date = stamp ? new Date(typeof stamp === "number" && stamp < 1e12 ? stamp * 1000 : stamp) : null;
      const hasValues = Object.values(values).some(value => number(value) !== "—");
      status.textContent = hasValues ? (date && Number.isFinite(date.getTime()) ? "Latest snapshot: " + date.toLocaleString() : "Latest reported totals · update time unavailable") : "No statistics have been published yet. Please check back soon.";
      const top = Array.isArray(stats.top_guilds) ? stats.top_guilds : [];
      document.getElementById("public-leaderboard").hidden = !top.length;
      document.getElementById("sr-top-guilds").innerHTML = top.slice(0,12).map((g,i) => "<tr><td>" + (i+1) + "</td><td>" + esc(g.name || g.guild_name || "Discord server") + "</td><td>" + number(g.members ?? g.member_count) + "</td><td>" + number(g.ratings ?? g.total_ratings) + "</td></tr>").join("");
    } catch (_) { status.textContent = "Statistics are temporarily unavailable. You can try refreshing in a moment."; }
    finally { nodes.forEach(node => node.classList.remove("loading-number")); button.disabled = false; button.textContent = "Refresh statistics"; }
  }
  button.addEventListener("click", load); load();
})();
