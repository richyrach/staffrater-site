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
    const from = Number(el.getAttribute('data-from') || '0');
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
          if(val !== undefined) animateCounter(n, val);
        });
        const tsEl = $('#sr-stats-updated');
        if(tsEl && cached.ts) tsEl.textContent = new Date(cached.ts).toLocaleString();
      }
    }catch(_){}

    const stats = await fetchStats();
    if(!stats) return;

    // normalize
    const data = {
      guilds: stats.guilds ?? stats.servers ?? 90,
      total_ratings: stats.total_ratings ?? stats.ratings ?? 0,
      avg_rating: stats.avg_rating ?? stats.avg ?? 0,
      tickets_open: stats.tickets_open ?? 0,
      tickets_closed: stats.tickets_closed ?? 0,
      apps_total: stats.apps_total ?? 0,
      cmds_24h: stats.cmds_24h ?? stats.commands_24h ?? 0,
      ts: stats.ts ?? new Date().toISOString()
    };

    try{ localStorage.setItem('sr_public_stats', JSON.stringify(data)); }catch(_){}

    nodes.forEach(n=>{
      const key=n.getAttribute('data-stat-key');
      const val=data[key];
      if(val === undefined) return;
      n.setAttribute('data-from', n.textContent.replace(/,/g,'') || '0');
      // float formatting for average
      if(key === 'avg_rating') n.setAttribute('data-fmt','float');
      animateCounter(n, val);
    });

    const tsEl = $('#sr-stats-updated');
    if(tsEl) tsEl.textContent = new Date(data.ts).toLocaleString();
  }

  hydrateCounters();
})();