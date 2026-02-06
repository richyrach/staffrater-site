(function(){
  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const COMMANDS = [
    // Ratings
    {name:"/rate", desc:"Rate a staff member with an optional comment.", usage:"/rate @staff 1-5 [comment]", cat:"Ratings"},
    {name:"/profile", desc:"View a staff member’s rating summary and recent comments.", usage:"/profile @staff", cat:"Ratings"},
    {name:"/leaderboard", desc:"Top-rated staff leaderboard for your server.", usage:"/leaderboard", cat:"Ratings"},
    {name:"/editrating", desc:"Edit your existing rating for a staff member.", usage:"/editrating @staff 1-5 [comment]", cat:"Ratings"},
    {name:"/deleterating", desc:"Delete your rating for a staff member.", usage:"/deleterating @staff", cat:"Ratings"},
    {name:"/flag", desc:"Flag an abusive/invalid rating for staff review.", usage:"/flag rating_id [reason]", cat:"Ratings"},
    {name:"/exportdata", desc:"Export rating data (admins only).", usage:"/exportdata", cat:"Ratings", tags:["Admin"]},

    // Setup
    {name:"/addadmin", desc:"Add a staff member as rateable admin.", usage:"/addadmin @user", cat:"Setup", tags:["Admin"]},
    {name:"/removeadmin", desc:"Remove a staff member from the admins list.", usage:"/removeadmin @user", cat:"Setup", tags:["Admin"]},
    {name:"/setratingchannel", desc:"Set where rating UI lives.", usage:"/setratingchannel #channel", cat:"Setup", tags:["Admin"]},
    {name:"/setresultchannel", desc:"Set where results/leaderboards are posted.", usage:"/setresultchannel #channel", cat:"Setup", tags:["Admin"]},
    {name:"/postratingui", desc:"Post the persistent rating UI (buttons/select).", usage:"/postratingui", cat:"Setup", tags:["Admin"]},

    // Tickets
    {name:"/setticketconfig", desc:"Configure ticket category, staff role, and log channel.", usage:"/setticketconfig #category @staffrole #log", cat:"Tickets", tags:["Admin"]},
    {name:"/postticketbutton", desc:"Post the ticket open button panel.", usage:"/postticketbutton", cat:"Tickets", tags:["Admin"]},

    // Applications
    {name:"/pendingapps", desc:"View and review pending applications.", usage:"/pendingapps", cat:"Applications", tags:["Staff"]},
    {name:"/createapplication", desc:"Create an application form.", usage:"/createapplication name", cat:"Applications", tags:["Admin"]},
    {name:"/deleteapp", desc:"Delete an application form.", usage:"/deleteapp name", cat:"Applications", tags:["Admin"]},
    {name:"/purgeapp", desc:"Purge application responses.", usage:"/purgeapp name", cat:"Applications", tags:["Admin"]},

    // Moderation
    {name:"/warn", desc:"Warn a user and store the warning.", usage:"/warn @user reason", cat:"Moderation", tags:["Mod"]},
    {name:"/warnings", desc:"View warnings for a user.", usage:"/warnings @user", cat:"Moderation", tags:["Mod"]},
    {name:"/mute", desc:"Temporarily mute a user.", usage:"/mute @user duration reason", cat:"Moderation", tags:["Mod"]},
    {name:"/unmute", desc:"Unmute a user.", usage:"/unmute @user", cat:"Moderation", tags:["Mod"]},
    {name:"/kick", desc:"Kick a user.", usage:"/kick @user reason", cat:"Moderation", tags:["Mod"]},
    {name:"/ban", desc:"Ban a user.", usage:"/ban @user reason", cat:"Moderation", tags:["Mod"]},
    {name:"/unban", desc:"Unban a user.", usage:"/unban user_id", cat:"Moderation", tags:["Mod"]},
    {name:"/purge", desc:"Bulk delete messages in a channel.", usage:"/purge amount", cat:"Moderation", tags:["Mod"]},

    // Utilities
    {name:"/poll", desc:"Create a quick poll.", usage:"/poll question | option1 | option2 ...", cat:"Utilities"},
    {name:"/pollresults", desc:"Show results for an existing poll.", usage:"/pollresults poll_id", cat:"Utilities"},
    {name:"/remindme", desc:"Set a personal reminder.", usage:"/remindme 10m take a break", cat:"Utilities"},
    {name:"/todo_add", desc:"Add a todo item.", usage:"/todo_add text", cat:"Utilities"},
    {name:"/todo_list", desc:"List your todos.", usage:"/todo_list", cat:"Utilities"},
    {name:"/todo_done", desc:"Mark a todo as done.", usage:"/todo_done id", cat:"Utilities"},
    {name:"/todo_del", desc:"Delete a todo item.", usage:"/todo_del id", cat:"Utilities"},
    {name:"/quotes", desc:"Browse saved quotes.", usage:"/quotes [user]", cat:"Utilities"},
    {name:"/addquote", desc:"Save a quote.", usage:"/addquote @user quote", cat:"Utilities"},
    {name:"/quoteid", desc:"Fetch a quote by ID.", usage:"/quoteid id", cat:"Utilities"},

    // Info
    {name:"/botstats", desc:"Shows bot stats (servers, uptime, etc).", usage:"/botstats", cat:"Info"},
    {name:"/serverinfo", desc:"Get server information.", usage:"/serverinfo", cat:"Info"},
    {name:"/userinfo", desc:"Get user information.", usage:"/userinfo @user", cat:"Info"},
    {name:"/avatar", desc:"Show a user’s avatar.", usage:"/avatar @user", cat:"Info"},
    {name:"/ping", desc:"Latency check.", usage:"/ping", cat:"Info"},
  ];

  const state = { q:"", cat:"All" };

  function uniqueCats(){
    const s = new Set(COMMANDS.map(c=>c.cat));
    return ["All", ...Array.from(s).sort()];
  }

  function matches(cmd){
    const q = state.q.trim().toLowerCase();
    const inCat = state.cat === "All" || cmd.cat === state.cat;
    if(!inCat) return false;
    if(!q) return true;
    return (cmd.name + " " + cmd.desc + " " + (cmd.usage||"") + " " + (cmd.tags||[]).join(" ")).toLowerCase().includes(q);
  }

  function render(){
    const list = $('#sr-cmd-list');
    const count = $('#sr-cmd-count');
    if(!list) return;

    const rows = COMMANDS.filter(matches);
    if(count) count.textContent = rows.length.toLocaleString();

    list.innerHTML = rows.map(c=>{
      const tags = (c.tags||[]).map(t=>`<span class="tag">${t}</span>`).join("");
      return `
        <div class="cmd-card reveal">
          <div class="cmd-top">
            <div>
              <div class="cmd-name">${c.name}</div>
              <div class="cmd-desc">${c.desc}</div>
            </div>
            <button class="btn small" data-copy="${(c.usage||c.name).replace(/"/g,'&quot;')}">Copy</button>
          </div>
          <div class="cmd-meta">
            <span class="tag">${c.cat}</span>
            ${tags}
            <span class="tag mono">${(c.usage||"").replace(/</g,'&lt;')}</span>
          </div>
        </div>
      `;
    }).join("");

    // Wire copy
    $$('[data-copy]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const text = b.getAttribute('data-copy');
        try{
          await navigator.clipboard.writeText(text);
          window.SR?.toast?.("Copied!");
        }catch(_){
          window.SR?.toast?.("Copy failed (browser blocked).");
        }
      });
    });

    // Reveal any new items
    if('IntersectionObserver' in window){
      const revealEls = $$('.reveal');
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
      $$('.reveal').forEach(el=>el.classList.add('is-visible'));
    }
  }

  function renderTabs(){
    const tabs = $('#sr-tabs');
    if(!tabs) return;
    tabs.innerHTML = uniqueCats().map(cat=>`
      <button class="tab ${cat===state.cat?'active':''}" data-cat="${cat}">${cat}</button>
    `).join("");
    $$('[data-cat]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.cat = btn.getAttribute('data-cat');
        renderTabs();
        render();
      });
    });
  }

  const input = $('#sr-search');
  if(input){
    input.addEventListener('input', ()=>{
      state.q = input.value;
      render();
    });
  }

  renderTabs();
  render();
})();
