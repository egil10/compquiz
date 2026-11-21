// Calendar and statistics pages (state lives in localStorage, shared with the game).
(function () {
  "use strict";

  const T = window.Trygdle;
  const $ = (id) => document.getElementById(id);
  const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

  /* ---------- calendar ---------- */

  // Month navigation is a real link (kalender.html?mnd=2026-10), loaded fresh like everything else.
  const monthLink = (d, ok, label, title) => {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return ok
      ? `<a class="icon-btn sm" href="kalender.html?mnd=${key}&t=${Date.now()}" aria-label="${title}">${label}</a>`
      : `<span class="icon-btn sm" aria-hidden="true" style="opacity:.25">${label}</span>`;
  };

  function renderCalendar(month) {
    const today = T.todayKey();
    const y = month.getFullYear(), m = month.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="cal-day empty"></span>');
    for (let d = 1; d <= days; d++) {
      const key = T.keyOf(new Date(y, m, d));
      const disabled = key < T.START_DATE || key > today;
      const saved = disabled ? null : T.loadDay(key);
      const res = saved && saved.status !== "playing" ? ` ${saved.status}` : saved && saved.guessIds.length ? " started" : "";
      const href = `./?${key}`; // game reads the date from the query
      cells.push(
        disabled
          ? `<span class="cal-day off">${d}</span>`
          : `<a class="cal-day${res}${key === today ? " today" : ""}" href="${href}">${d}</a>`
      );
    }
    const prevOk = new Date(y, m, 1) > T.dateOf(T.START_DATE);
    const nextOk = new Date(y, m + 1, 1) <= T.dateOf(today);
    $("cal-body").innerHTML = `
      <div class="cal-nav">
        ${monthLink(new Date(y, m - 1, 1), prevOk, "‹", "Forrige måned")}
        <b>${MONTHS[m]} ${y}</b>
        ${monthLink(new Date(y, m + 1, 1), nextOk, "›", "Neste måned")}
      </div>
      <div class="cal-grid">
        ${["ma", "ti", "on", "to", "fr", "lø", "sø"].map((d) => `<span class="cal-dow">${d}</span>`).join("")}
        ${cells.join("")}
      </div>
      <div class="cal-legend"><span class="won"></span>Løst<span class="lost"></span>Ikke løst<span class="started"></span>Påbegynt</div>`;
  }

  /* ---------- stats ---------- */

  function renderStats() {
    const s = T.getStats();
    // Streak is broken if the last daily was played before yesterday.
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (s.lastDate && s.lastDate < T.keyOf(y)) s.currentStreak = 0;
    const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    const max = Math.max(1, ...Object.values(s.dist));
    $("stats-body").innerHTML = `
      <div class="kpis">
        <div><b>${s.played}</b><span>Spilt</span></div>
        <div><b>${pct}</b><span>Vunnet %</span></div>
        <div><b>${s.currentStreak}</b><span>Rekke</span></div>
        <div><b>${s.maxStreak}</b><span>Beste</span></div>
      </div>
      <div class="dist">
        ${[1, 2, 3, 4, 5, 6]
          .map((n) => {
            const v = s.dist[n] || 0;
            return `<div class="dist-row"><span>${n}</span><div class="bar" style="width:${Math.max(7, (v / max) * 100)}%">${v}</div></div>`;
          })
          .join("")}
      </div>
      <p class="page-note">Kun dagens selskap teller.</p>`;
  }

  if ($("cal-body")) {
    const now = new Date();
    const q = new URLSearchParams(location.search).get("mnd");
    const mm = q && q.match(/^(\d{4})-(\d\d)$/);
    let month = mm ? new Date(+mm[1], +mm[2] - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
    const first = T.dateOf(T.START_DATE);
    if (month < new Date(first.getFullYear(), first.getMonth(), 1) || month > now) month = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar(month);
  }
  if ($("stats-body")) {
    renderStats();
    $("btn-reset-stats").addEventListener("click", () => {
      try {
        localStorage.removeItem(T.STORE_STATS);
      } catch (e) {}
      location.replace(`statistikk.html?t=${Date.now()}`);
    });
  }
})();
