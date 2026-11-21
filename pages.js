// Calendar and statistics pages (state lives in localStorage, shared with the game).
(function () {
  "use strict";

  const T = window.Trygdle;
  const $ = (id) => document.getElementById(id);
  const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

  /* ---------- calendar ---------- */

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
      const href = `./?${key}`;
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
        <button class="icon-btn sm" id="cal-prev" ${prevOk ? "" : "disabled"} aria-label="Forrige måned">‹</button>
        <b>${MONTHS[m]} ${y}</b>
        <button class="icon-btn sm" id="cal-next" ${nextOk ? "" : "disabled"} aria-label="Neste måned">›</button>
      </div>
      <div class="cal-grid">
        ${["ma", "ti", "on", "to", "fr", "lø", "sø"].map((d) => `<span class="cal-dow">${d}</span>`).join("")}
        ${cells.join("")}
      </div>
      <div class="cal-legend"><span class="won"></span>Løst<span class="lost"></span>Ikke løst<span class="started"></span>Påbegynt</div>`;
    $("cal-prev").onclick = () => renderCalendar(new Date(y, m - 1, 1));
    $("cal-next").onclick = () => renderCalendar(new Date(y, m + 1, 1));
  }

  /* ---------- stats ---------- */

  function renderStats() {
    const s = T.getStats();
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
    renderCalendar(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  if ($("stats-body")) {
    renderStats();
    $("btn-reset-stats").addEventListener("click", () => {
      try {
        localStorage.removeItem(T.STORE_STATS);
      } catch (e) {}
      renderStats();
    });
  }
})();
