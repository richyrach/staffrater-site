(function(){
  const $ = (s, el=document) => el.querySelector(s);

  async function fetchStats(){
    const endpoints = [
      '/api/stats-get',
      '/api/stats',
      '/api/public-stats',
      '/api/metrics'
    ];
    for(const url of endpoints){
      try{
        const r = await fetch(url, {credentials:'include'});
        if(!r.ok) continue;
        const j = await r.json();
        if(j && (j.ok === true || j.guilds || j.total_ratings || j.avg_rating)){
          return j.data || j;
        }
      }catch(_){}
    }
    return null;
  }

  function fmt(n){
    if(n === null || n === undefined) return "—";
    if(typeof n === "number") return n.toLocaleString();
    return String(n);
  }

  async function main(){
    const box = $('#sr-stats-json');
    const err = $('#sr-stats-err');
    try{
      const s = await fetchStats();
      if(!s){
        if(err) err.textContent = "No public stats endpoint detected. If you want live stats here, keep /api/stats-get (or add one later).";
        if(box) box.textContent = JSON.stringify({hint:"Use /api/stats-get (recommended)."}, null, 2);
        return;
      }
      if(err) err.textContent = "";
      const normalized = {
        guilds: s.guilds ?? s.servers ?? null,
        total_ratings: s.total_ratings ?? s.ratings ?? null,
        avg_rating: s.avg_rating ?? s.avg ?? null,
        cmds_24h: s.cmds_24h ?? s.commands_24h ?? null,
        ts: s.ts ?? null,
        top_guilds: s.top_guilds ?? s.leaderboard ?? [],
      };
      if(box) box.textContent = JSON.stringify(normalized, null, 2);

      // table of top guilds if provided
      const tbody = $('#sr-top-guilds');
      if(tbody && Array.isArray(normalized.top_guilds) && normalized.top_guilds.length){
        tbody.innerHTML = normalized.top_guilds.slice(0,12).map((g, i)=>{
          const name = g.name ?? g.guild_name ?? ("Guild " + (g.guild_id ?? ""));
          const members = g.members ?? g.member_count ?? g.users ?? null;
          const ratings = g.ratings ?? g.total_ratings ?? null;
          return `<tr>
            <td class="small muted">${i+1}</td>
            <td>${escapeHtml(name)}</td>
            <td class="small muted">${fmt(members)}</td>
            <td class="small muted">${fmt(ratings)}</td>
          </tr>`;
        }).join("");
      }
    }catch(e){
      if(err) err.textContent = "Error loading stats: " + (e?.message || String(e));
    }
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  main();
})();