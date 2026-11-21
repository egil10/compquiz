// Shared header + helpers for every Trygdle page (game, table, calendar, stats, help).
// Loaded synchronously right after <header id="topbar" data-page="..."> so the
// game script can bind to the header elements.
(function () {
  "use strict";

  const START_DATE = "2026-11-01";
  const keyOf = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateOf = (key) => new Date(key + "T00:00:00");
  const todayKey = () => keyOf(new Date());
  const shortDate = (key = todayKey()) =>
    dateOf(key).toLocaleDateString("nb-NO", { day: "numeric", month: "short" }).replace(/\.$/, "");
  const loadDay = (key) => {
    try {
      return JSON.parse(localStorage.getItem(`trygdle_day_${key}`) || "null");
    } catch (e) {
      return null;
    }
  };
  const STORE_STATS = "folketrygdle_stats_2026";
  const getStats = () => {
    const base = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(STORE_STATS) || "{}") };
    } catch (e) {
      return base;
    }
  };

  window.Trygdle = { START_DATE, keyOf, dateOf, todayKey, shortDate, loadDay, getStats, STORE_STATS };

  const header = document.getElementById("topbar");
  if (!header) return;
  const page = header.dataset.page || "game";
  const icon = (paths, w = 21) =>
    `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const link = (href, key, label, svg) =>
    `<a href="${href}" class="icon-btn${page === key ? " active" : ""}" aria-label="${label}" title="${label}"${page === key ? ' aria-current="page"' : ""}>${svg}</a>`;

  header.className = "topbar";
  header.innerHTML = `
    <div class="topbar-side">
      ${link("hjelp.html", "help", "Slik spiller du", icon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 22))}
    </div>
    <div class="brand">
      <h1 class="title"><a href="./" title="Dagens selskap">Trygdle</a></h1>
      <nav class="modes" aria-label="Modus">
        <a class="mode-btn" data-mode="daily" href="./" title="Dagens selskap"><span id="daily-num">${shortDate()}</span></a>
        <span class="mode-sep" aria-hidden="true">·</span>
        <a class="mode-btn" data-mode="practice" href="./?frispill" title="Ubegrenset med runder">Frispill</a>
      </nav>
      <div id="toast" class="status" role="status" aria-live="polite"></div>
    </div>
    <div class="topbar-side right">
      ${link("data.html", "data", "Alle selskaper", icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'))}
      ${link("kalender.html", "calendar", "Tidligere dager", icon('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'))}
      ${link("statistikk.html", "stats", "Statistikk", icon('<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>', 22))}
    </div>`;

  // Header navigation always loads a fresh copy of the target page (cache-busting
  // ?t=…), so an old cached page can never send you somewhere unexpected.
  // This includes the date / Frispill links: ./ = today's daily, ./?frispill = practice.
  header.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const href = a.getAttribute("href");
    location.href = href + (href.includes("?") ? "&" : "?") + "t=" + Date.now();
  });

  // Tidy the address bar (drop the cache-busting parameter).
  if (/[?&]t=\d+/.test(location.search)) {
    const q = location.search.replace(/[?&]t=\d+/, "").replace(/^&/, "?");
    history.replaceState(null, "", location.pathname + (q === "?" ? "" : q) + location.hash);
  }

  // Coming back via the browser's back/forward cache: reload so the page is current.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
})();
