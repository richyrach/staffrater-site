(() => {
  const toggle = document.querySelector(".menu-toggle");
  const mobile = document.getElementById("mobile-nav");
  function closeMenu() { if (!toggle || !mobile) return; mobile.hidden = true; toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open navigation"); }
  if (toggle && mobile) {
    toggle.addEventListener("click", () => { const open = toggle.getAttribute("aria-expanded") !== "true"; mobile.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); });
    mobile.addEventListener("click", e => { if (e.target.closest("a")) closeMenu(); });
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeMenu(); document.querySelectorAll(".resource-menu[open]").forEach(menu => menu.open = false); } });
  document.addEventListener("click", e => { document.querySelectorAll(".resource-menu[open]").forEach(menu => { if (!menu.contains(e.target)) menu.open = false; }); });
  document.querySelectorAll(".main-nav a,.mobile-nav a,.resource-links a").forEach(link => { if (new URL(link.href).pathname === location.pathname) link.setAttribute("aria-current", "page"); });
  window.SR = window.SR || {};
  window.SR.toast = message => { const node = document.getElementById("sr-toast"); if (!node) return; node.textContent = message; node.classList.add("show"); clearTimeout(window.SR.timer); window.SR.timer = setTimeout(() => node.classList.remove("show"), 2200); };
  const sections = [...document.querySelectorAll(".guide-content section[id]")];
  if (sections.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => { for (const entry of entries) { if (!entry.isIntersecting) continue; document.querySelectorAll(".guide-toc a").forEach(a => a.classList.toggle("active", a.hash === "#" + entry.target.id)); } }, {rootMargin:"-15% 0px -65% 0px"});
    sections.forEach(section => observer.observe(section));
  }
  async function auth() {
    const nav = document.getElementById("nav-auth");
    if (!nav) return;
    try {
      const response = await fetch("/api/me", {credentials:"include", signal:AbortSignal.timeout(10000)});
      if (!response.ok) return;
      const me = await response.json(), user = me?.ok && me.session?.user;
      if (!user) return;
      const link = document.createElement("a"); link.className = "btn ghost nav-profile"; link.href = "/dashboard/"; link.title = "Open your dashboard";
      if (user.avatar) { const img = document.createElement("img"); img.src = "https://cdn.discordapp.com/avatars/" + encodeURIComponent(user.id) + "/" + encodeURIComponent(user.avatar) + ".png?size=64"; img.alt = ""; img.width = 23; img.height = 23; link.append(img); }
      const label = document.createElement("span"); label.textContent = "Dashboard"; link.append(label); nav.replaceChildren(link);
    } catch (_) {}
  }
  auth();
})();
