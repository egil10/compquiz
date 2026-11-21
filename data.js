(function () {
  "use strict";

  const MD = window.MARKET_DATA || {};
  const rows = (window.PORTFOLIO_COMPANIES || []).map((c) => {
    const m = MD[c.id] || {};
    const ytd = m.ytd && m.ytd.length ? m.ytd[m.ytd.length - 1] : null;
    return {
      ...c,
      mcap: m.mcapBNOK ?? null,
      pe: m.pe ?? null,
      ev: m.evEbitda ?? null,
      div: m.div ?? null,
      ytd,
      founded: m.founded ?? null,
      logo: m.logo ? `logos/${c.id.toLowerCase()}.png` : null
    };
  });

  const FLAG_COLORS = {
    NO: ["#BA0C2F", "#FFFFFF", "#00205B"],
    IS: ["#02529C", "#FFFFFF", "#DC1E35"],
    SE: ["#006AA7", "#FECC00"],
    DK: ["#C8102E", "#FFFFFF"],
    FI: ["#FFFFFF", "#002F6C"]
  };
  function flag(iso) {
    const [bg, cross, inner] = FLAG_COLORS[iso] || ["#ccc", "#fff"];
    const c = (x, w, y, h, fill) =>
      `<rect x="${x}" y="0" width="${w}" height="16" fill="${fill}"/><rect x="0" y="${y}" width="22" height="${h}" fill="${fill}"/>`;
    const body = inner ? c(6, 4, 6, 4, cross) + c(7, 2, 7, 2, inner) : c(6, 3, 6.5, 3, cross);
    return `<svg class="flag" viewBox="0 0 22 16" aria-label="${iso}"><rect width="22" height="16" fill="${bg}"/>${body}</svg>`;
  }

  const dash = '<span class="na">–</span>';
  const fmtB = (b) => (b == null ? dash : b >= 1000 ? `${(b / 1000).toFixed(2)}T` : b >= 10 ? `${Math.round(b)}B` : `${b.toFixed(1)}B`);
  const fmtX = (v) => (v == null ? dash : `${v >= 20 ? Math.round(v) : v.toFixed(1)}x`);
  const fmtP = (v, d = 1) => (v == null ? dash : `${v.toFixed(d)}%`);
  const fmtM = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}B` : v >= 1 ? `${Math.round(v)}M` : `${v.toFixed(1)}M`);

  const SHORT_SECTOR = {
    Konsumvarer: "Konsum",
    "Varige konsumvarer": "Varig konsum",
    Telekommunikasjon: "Telekom"
  };

  // key, label, value getter, cell renderer, numeric?, priority (1 = always shown, higher = hidden on narrow screens)
  const COLS = [
    ["rank", "#", (r) => r.rank, (r) => r.rank, true, 3],
    ["name", "Selskap", (r) => r.name, (r) =>
      `<span class="dt-co">${flag(r.iso)}${r.logo ? `<img class="logo" src="${r.logo}" alt="" loading="lazy">` : '<span class="logo logo-fallback">' + r.name[0] + "</span>"}<span class="dt-nm"><b title="${r.name}">${r.name}</b><small>${r.bbgTicker || ""}</small></span></span>`, false, 1],
    ["sector", "Sektor", (r) => r.sector, (r) => SHORT_SECTOR[r.sector] || r.sector, false, 2],
    ["mcap", "Mcap", (r) => r.mcap, (r) => fmtB(r.mcap), true, 1],
    ["pe", "P/E", (r) => r.pe, (r) => fmtX(r.pe), true, 1],
    ["ev", "EV/EBITDA", (r) => r.ev, (r) => fmtX(r.ev), true, 2],
    ["own", "Eier", (r) => r.ownershipPct, (r) => fmtP(r.ownershipPct, r.ownershipPct >= 10 ? 1 : 2), true, 2],
    ["value", "Post", (r) => r.marketValueMNOK, (r) => fmtM(r.marketValueMNOK), true, 3],
    ["fund", "Fond", (r) => r.fund, (r) => `<span class="dt-fund">${r.fund}</span>`, false, 3],
    ["div", "Utb.", (r) => r.div, (r) => fmtP(r.div), true, 3],
    ["ytd", "I år", (r) => r.ytd, (r) =>
      r.ytd == null ? dash : `<span class="${r.ytd >= 0 ? "pos" : "neg"}">${r.ytd >= 0 ? "+" : ""}${Math.round(r.ytd)}%</span>`, true, 1],
    ["founded", "Stiftet", (r) => r.founded, (r) => r.founded ?? dash, true, 3]
  ];

  const state = { sort: "rank", dir: 1, q: "", country: "ALL" };
  const $ = (id) => document.getElementById(id);
  const norm = (s) =>
    String(s || "").toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "");

  function renderHead() {
    const tips = { mcap: "Børsverdi i NOK", own: "Folketrygdfondets eierandel", value: "Folketrygdfondets post i NOK", div: "Utbytteavkastning", ytd: "Kursutvikling i år" };
    $("thead").innerHTML = COLS.map(([key, label, , , num, prio]) => {
      const active = state.sort === key;
      return `<th class="${num ? "num" : ""}${active ? " active" : ""} p${prio}" data-key="${key}"${tips[key] ? ` title="${tips[key]}"` : ""}>${label}<i>${active ? (state.dir > 0 ? "↑" : "↓") : ""}</i></th>`;
    }).join("");
    $("thead").querySelectorAll("th").forEach((th) =>
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        const num = COLS.find((c) => c[0] === key)[4];
        if (state.sort === key) state.dir *= -1;
        else {
          state.sort = key;
          state.dir = num && key !== "rank" && key !== "founded" ? -1 : 1; // numbers: biggest first
        }
        render();
      })
    );
  }

  function renderFilters() {
    const opts = [["ALL", "Alle"], ["Norge", "NO"], ["Sverige", "SE"], ["Danmark", "DK"], ["Finland", "FI"], ["Island", "IS"]];
    $("filters").innerHTML = opts
      .map(([v, l]) => `<button class="mode-btn${state.country === v ? " active" : ""}" data-v="${v}">${l}</button>`)
      .join("");
    $("filters").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        state.country = b.dataset.v;
        renderFilters();
        render();
      })
    );
  }

  function render() {
    renderHead();
    const q = norm(state.q);
    const col = COLS.find((c) => c[0] === state.sort);
    const list = rows
      .filter((r) => state.country === "ALL" || r.country === state.country)
      .filter((r) => !q || norm([r.name, r.bbgTicker, r.sector, r.hq, r.fund, r.country].join(" ")).includes(q))
      .sort((a, b) => {
        const va = col[2](a), vb = col[2](b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1; // missing values always last
        if (vb == null) return -1;
        return (typeof va === "string" ? va.localeCompare(vb, "nb") : va - vb) * state.dir;
      });
    $("count").textContent = `${list.length} av ${rows.length} selskaper`;
    $("tbody").innerHTML = list
      .map((r) => `<tr>${COLS.map(([key, , , cell, num, prio]) => `<td class="${num ? "num" : ""} c-${key} p${prio}">${cell(r)}</td>`).join("")}</tr>`)
      .join("");
  }

  const d = (s) => (s ? s.split("-").reverse().join(".") : "");
  $("source").textContent = `Kurser ${(window.MARKET_META || {}).source || "Yahoo Finance"} ${d((window.MARKET_META || {}).date)} · Beholdning ${d((window.PORTFOLIO_META || {}).reportDate)}`;
  $("q").addEventListener("input", (e) => {
    state.q = e.target.value;
    render();
  });
  renderFilters();
  render();
})();
