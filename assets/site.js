(function(){
  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  // Mobile menu (optional)
  const burger = $('#sr-burger');
  const mobile = $('#sr-mobile');
  if(burger && mobile){
    burger.addEventListener('click', () => mobile.classList.toggle('hidden'));
  }

  // Reveal animations
  const revealEls = $$('.reveal');
  if('IntersectionObserver' in window && revealEls.length){
    const io = new IntersectionObserver((entries)=>{
      for(const e of entries){
        if(e.isIntersecting){
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    }, {threshold: 0.12});
    revealEls.forEach(el=>io.observe(el));
  } else {
    revealEls.forEach(el=>el.classList.add('is-visible'));
  }

  // FAQ accordions
  $$('.faq-q').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const item = btn.closest('.faq-item');
      if(!item) return;
      item.classList.toggle('open');
    });
  });

  // Small helpers
  window.SR = window.SR || {};
  window.SR.toast = (text)=>{
    const t = $('#sr-toast');
    if(!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(window.SR._toastTimer);
    window.SR._toastTimer = setTimeout(()=>t.classList.remove('show'), 1400);
  };

  // Fetch public stats if an endpoint exists. We try multiple candidates so it works across versions.
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

  function animateCounter(el, to){
    to = Number(to);
    if(!Number.isFinite(to)) return;
    // data-from is read back out of the element's own text, which may be a
    // placeholder like "—". Number("—") is NaN, and NaN poisons every frame.
    const fromRaw = Number(el.getAttribute('data-from'));
    const from = Number.isFinite(fromRaw) ? fromRaw : 0;
    const dur = Number(el.getAttribute('data-dur') || '900');
    const start = performance.now();
    const fmt = el.getAttribute('data-fmt') || 'int';
    const step = (t)=>{
      const p = Math.min(1, (t - start)/dur);
      const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      if(fmt === 'float'){
        el.textContent = v.toFixed(2);
      } else {
        el.textContent = Math.round(v).toLocaleString();
      }
      if(p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Apply stats to counters on page (if present)
  async function hydrateCounters(){
    const nodes = $$('[data-stat-key]');
    if(!nodes.length) return;

    // show cached quickly
    try{
      const cached = JSON.parse(localStorage.getItem('sr_public_stats') || 'null');
      if(cached){
        nodes.forEach(n=>{
          const key=n.getAttribute('data-stat-key');
          const val = cached[key];
          if(val !== undefined && val !== null) animateCounter(n, val);
        });
        const tsEl = $('#sr-stats-updated');
        if(tsEl && cached.ts) tsEl.textContent = new Date(cached.ts).toLocaleString();
      }
    }catch(_){}

    const stats = await fetchStats();
    if(!stats) return;

    // normalize
    // Never invent numbers. Anything missing stays null so the placeholder is
    // left alone — falling back to 0 here is what rendered "NaN", and a 0 would
    // be a lie anyway (same reason the hardcoded 90 servers had to go).
    const data = {
      guilds: stats.guilds ?? stats.servers ?? null,
      total_ratings: stats.total_ratings ?? stats.ratings ?? null,
      avg_rating: stats.avg_rating ?? stats.avg ?? null,
      tickets_open: stats.tickets_open ?? null,
      tickets_closed: stats.tickets_closed ?? null,
      apps_total: stats.apps_total ?? null,
      cmds_24h: stats.cmds_24h ?? stats.commands_24h ?? null,
      ts: stats.updated_at ?? stats.ts ?? null
    };

    // Don't cache an all-empty payload, or the page keeps replaying "no data".
    const hasAny = Object.keys(data).some(k => k !== 'ts' && data[k] !== null);
    if(hasAny){
      try{ localStorage.setItem('sr_public_stats', JSON.stringify(data)); }catch(_){}
    }

    nodes.forEach(n=>{
      const key=n.getAttribute('data-stat-key');
      const val=data[key];
      if(val === undefined || val === null) return;
      n.setAttribute('data-from', n.textContent.replace(/,/g,'') || '0');
      // float formatting for average
      if(key === 'avg_rating') n.setAttribute('data-fmt','float');
      animateCounter(n, val);
    });

    const tsEl = $('#sr-stats-updated');
    // No timestamp means the bot has not pushed yet — don't claim "just now".
    if(tsEl) tsEl.textContent = data.ts ? new Date(data.ts).toLocaleString() : "—";
  }
  

  hydrateCounters();
})();
(async function authSwap(){
  try{
    const r = await fetch("/api/me", { credentials: "include" });
    if(!r.ok) return;

    const me = await r.json();
    // /api/me returns { ok, session: { user, guilds } } — the old code read
    // me.user, which is always undefined, so this never ran for signed-in users.
    const user = me && me.ok && me.session && me.session.user;
    if(!user) return;

    const nav = document.getElementById("nav-auth");
    const signin = document.getElementById("nav-signin");
    if(!nav || !signin) return;

    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64`
      : "/assets/bot-avatar.png";
    nav.innerHTML = "";

    const profile = document.createElement("a");
    profile.className = "btn ghost nav-profile";
    profile.href = "/dashboard/";
    profile.title = user.username ? `Open dashboard as ${user.username}` : "Open dashboard";
    const img = document.createElement("img");
    img.src = avatar;
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = "Dashboard";
    profile.append(img, label);

    const logout = document.createElement("a");
    logout.className = "btn";
    logout.href = "/api/logout?redirect=/";
    logout.textContent = "Log out";
    nav.append(profile, logout);
  }catch(e){
    // silent
  }
})();
