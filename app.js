(function () {
  "use strict";

  const MD = window.MARKET_DATA || {};
  const ALL = window.PORTFOLIO_COMPANIES || [];
  // Every portfolio company with market data is guessable.
  const COMPANIES = ALL.filter((c) => MD[c.id]).map((c) => {
    const m = MD[c.id];
    return {
      ...c,
      pe: m.pe,
      evEbitda: m.evEbitda,
      mcapBNOK: m.mcapBNOK,
      priceNOK: m.priceNOK,
      div: m.div,
      founded: m.founded,
      ytd: m.ytd,
      logo: m.logo ? `logos/${c.id.toLowerCase()}.png` : null
    };
  });
  const BY_ID = new Map(COMPANIES.map((c) => [c.id, c]));
  // Daily answers come from the larger, well-known holdings.
  const DAILY_POOL = ALL.filter((c) => c.isMajorPool);

  const MAX_GUESSES = 6;
  const MAX_HINTS = 3;
  const FLIP_STAGGER = 220;
  const FLIP_DURATION = 500;
  const TILE_COUNT = 7;
  const EXACT = 0.05; // green: within ±5 %
  const NEAR = 0.25; // yellow: within ±25 %
  const STORE_STATS = "folketrygdle_stats_2026";
  const WIN_WORDS = ["Geni!", "Imponerende!", "Strålende!", "Flott!", "Bra!", "Puh!"];

  const COUNTRY = {
    Norge: { lat: 59.91, lon: 10.75 },
    Sverige: { lat: 59.33, lon: 18.06 },
    Danmark: { lat: 55.68, lon: 12.57 },
    Finland: { lat: 60.17, lon: 24.94 },
    Island: { lat: 64.15, lon: -21.94 }
  };

  const SECTOR_CLUSTER = {
    Energi: "energy", Forsyning: "energy",
    Industri: "ind", Materialer: "ind",
    Konsumvarer: "cons", "Varige konsumvarer": "cons",
    Teknologi: "tech", Telekommunikasjon: "tech",
    Finans: "fin", Eiendom: "fin",
    Helse: "health"
  };
  const SHORT_SECTOR = {
    Konsumvarer: "Konsum",
    "Varige konsumvarer": "Varig konsum",
    Telekommunikasjon: "Telekom",
    Materialer: "Råvarer",
    Teknologi: "Tech",
    Forsyning: "Kraft"
  };

  // Small Nordic-cross flags (inline SVG renders everywhere, unlike emoji flags).
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

  const ARROW =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  const CHECK =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const arrow = (deg) => `<i style="transform:rotate(${Math.round(deg)}deg)">${ARROW}</i>`;
  const check = `<i>${CHECK}</i>`;

  const $ = (id) => document.getElementById(id);
  const el = {
    dailyNum: $("daily-num"),
    rows: $("board-rows"),
    hints: $("hints"),
    ytd: $("ytd"),
    entry: $("entry"),
    input: $("guess-input"),
    ac: $("ac"),
    btnHint: $("btn-hint"),
    doneBar: $("done-bar"),
    btnNext: $("btn-next"),
    statsBody: $("stats-body"),
    toast: $("toast")
  };

  const state = {
    mode: "daily",
    target: null,
    guesses: [],
    hints: 0,
    status: "playing",
    dailyNumber: 1,
    dateKey: "",
    day: null, // selected archive day (null = today)
    revealing: false,
    acList: [],
    acIdx: 0,
    played: new Set(),
    giveUpArmed: false
  };

  /* ---------- helpers ---------- */

  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/ø/g, "o")
      .replace(/æ/g, "ae")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();

  const sectorShort = (s) => SHORT_SECTOR[s] || s;

  function fmtB(b) {
    if (b >= 1000) return `${(b / 1000).toFixed(1).replace(/\.0$/, "")}T`;
    if (b >= 10) return `${Math.round(b)}B`;
    if (b >= 1) return `${b.toFixed(1)}B`;
    return `${Math.round(b * 1000)}M`;
  }
  const fmtX = (v) => (v == null ? "–" : `${v >= 20 ? Math.round(v) : +v.toFixed(1)}x`);
  const fmtPct = (v) => (v == null ? "–" : `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}%`);

  function bearing(from, to) {
    const a = COUNTRY[from], b = COUNTRY[to];
    if (!a || !b) return 0;
    const dLat = b.lat - a.lat;
    const dLon = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) * Math.PI) / 360);
    return (Math.atan2(dLon, dLat) * 180) / Math.PI;
  }

  const START_DATE = "2026-11-01"; // first daily puzzle; the archive starts here

  const keyOf = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateOf = (key) => new Date(key + "T00:00:00");
  const dateKeyToday = () => keyOf(new Date());
  const isToday = (key) => key === dateKeyToday();

  // e.g. "21. nov"
  const shortDate = (key = dateKeyToday()) =>
    dateOf(key).toLocaleDateString("nb-NO", { day: "numeric", month: "short" }).replace(/\.$/, "");

  // Deterministic shuffle of the daily pool, identical for every player: day N of the
  // calendar gets entry N of the shuffled list, so no repeats until the pool is exhausted.
  const DAILY_ORDER = (() => {
    const ids = DAILY_POOL.map((c) => c.id).filter((id) => BY_ID.has(id)).sort();
    let seed = 20261101;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  })();

  function dailyInfo(dateKey = state.day || dateKeyToday()) {
    const num = Math.round((dateOf(dateKey) - dateOf(START_DATE)) / 86400000);
    const idx = ((num % DAILY_ORDER.length) + DAILY_ORDER.length) % DAILY_ORDER.length;
    return { dateKey, num: num + 1, company: BY_ID.get(DAILY_ORDER[idx]) };
  }

  /* ---------- evaluation ---------- */

  function evalNum(g, t, fmt, isWin) {
    if (g == null && t == null) return { s: "exact", v: "–", icon: "" };
    if (g == null) return { s: "wrong", v: "–", icon: "" };
    if (t == null) return { s: "wrong", v: fmt(g), icon: '<i class="na">–</i>' };
    if (isWin || fmt(g) === fmt(t)) return { s: "exact", v: fmt(g), icon: check };
    const diff = Math.abs(g - t) / Math.max(Math.abs(t), 1e-9);
    const s = diff <= EXACT ? "exact" : diff <= NEAR ? "close" : "wrong";
    return { s, v: fmt(g), icon: arrow(t > g ? 0 : 180) };
  }

  // Founding year: green = same year, yellow = within 10 years.
  function evalYear(g, t, isWin) {
    if (g == null) return { s: "wrong", v: "–", icon: "" };
    if (t == null) return { s: "wrong", v: String(g), icon: '<i class="na">–</i>' };
    if (isWin || g === t) return { s: "exact", v: String(g), icon: check };
    return { s: Math.abs(g - t) <= 10 ? "close" : "wrong", v: String(g), icon: arrow(t > g ? 0 : 180) };
  }

  function evaluate(g, t) {
    const win = g.id === t.id;
    const sameCountry = g.country === t.country;
    const related = SECTOR_CLUSTER[g.sector] === SECTOR_CLUSTER[t.sector];
    return {
      win,
      tiles: [
        {
          s: sameCountry ? "exact" : "wrong",
          v: flag(g.iso),
          icon: sameCountry ? check : arrow(bearing(g.country, t.country)),
          title: g.country
        },
        {
          s: g.sector === t.sector ? "exact" : related ? "close" : "wrong",
          v: sectorShort(g.sector),
          icon: "",
          title: g.sector,
          small: true
        },
        evalNum(g.mcapBNOK, t.mcapBNOK, fmtB, win),
        evalNum(g.pe, t.pe, fmtX, win),
        evalNum(g.evEbitda, t.evEbitda, fmtX, win),
        evalNum(g.ownershipPct, t.ownershipPct, fmtPct, win),
        evalYear(g.founded, t.founded, win)
      ]
    };
  }

  /* ---------- rendering ---------- */

  const logoImg = (c, cls = "logo") =>
    c.logo
      ? `<img class="${cls}" src="${c.logo}" alt="" loading="lazy" onerror="this.remove()">`
      : `<span class="${cls} logo-fallback">${c.name[0]}</span>`;

  function tileHtml(t, animate, i, win) {
    const flipDelay = i * FLIP_STAGGER;
    const bounceDelay = (TILE_COUNT - 1) * FLIP_STAGGER + FLIP_DURATION + i * 80;
    const delay = animate ? ` style="animation-delay:${flipDelay}ms${win ? `, ${bounceDelay}ms` : ""}"` : "";
    return `<div class="tile s-${t.s}${animate ? " flip" : ""}${t.small ? " small" : ""}"${delay}${
      t.title ? ` title="${t.title}"` : ""
    }><b>${t.v}</b>${t.icon}</div>`;
  }

  function renderBoard(animateLast = false) {
    const html = [];
    for (let r = 0; r < MAX_GUESSES; r++) {
      const g = state.guesses[r];
      if (g) {
        const ev = evaluate(g, state.target);
        const anim = animateLast && r === state.guesses.length - 1;
        html.push(`
          <div class="row${anim && ev.win ? " win" : ""}">
            <div class="row-name">${logoImg(g)}<span class="nm">${g.name}</span><span class="tk">${g.bbgTicker}</span></div>
            <div class="tiles">${ev.tiles.map((t, i) => tileHtml(t, anim, i, ev.win)).join("")}</div>
          </div>`);
      } else if (state.status === "lost" && !state.revealing) {
        if (r === state.guesses.length) html.push(solutionRow());
      } else {
        const active = r === state.guesses.length && state.status === "playing";
        html.push(`
          <div class="row empty${active ? " active" : ""}">
            <div class="row-name">${active ? '<em id="live-name"></em>' : ""}</div>
            <div class="tiles">${'<div class="tile"></div>'.repeat(TILE_COUNT)}</div>
          </div>`);
      }
    }
    if (state.status === "lost" && !state.revealing && state.guesses.length >= MAX_GUESSES) html.push(solutionRow());
    el.rows.innerHTML = html.join("");
  }

  function solutionRow() {
    const t = state.target;
    const tiles = evaluate(t, t).tiles.map((x) => ({ ...x, s: "answer", icon: "" }));
    return `
      <div class="row solution">
        <div class="row-name">${logoImg(t)}<span class="nm">${t.name}</span><span class="tk">${t.bbgTicker}</span><span class="tag">Fasit</span></div>
        <div class="tiles">${tiles.map((x, i) => tileHtml(x, false, i)).join("")}</div>
      </div>`;
  }

  function sparkline(series) {
    const w = 300, h = 36, pad = 3;
    const min = Math.min(0, ...series), max = Math.max(0, ...series);
    const span = max - min || 1;
    const x = (i) => (i / (series.length - 1)) * w;
    const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
    const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `0,${y(0).toFixed(1)} ${pts} ${w},${y(0).toFixed(1)}`;
    const last = series[series.length - 1];
    return `<div class="ytd ${last >= 0 ? "up" : "down"}">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="${area}" class="area"/>
        <line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="zero"/>
        <polyline points="${pts}"/>
      </svg>
      <div class="ytd-label"><b>${last >= 0 ? "+" : ""}${Math.round(last)} %</b><small>i år</small></div>
    </div>`;
  }

  function renderHints() {
    const t = state.target;
    const playing = state.status === "playing";
    const n = playing ? state.hints : 0;
    el.ytd.innerHTML = t.ytd ? sparkline(t.ytd) : "";

    // From the first hint, four fixed slots: city, fund (SPN/SFT), dividend, logo. Each hint reveals a bit more.
    const parts = [];
    if (n >= 1) {
      const city = (t.hq || "?").split("/")[0].trim();
      parts.push(`<span class="chip city" title="Hovedkontor">${city}</span>`);
      parts.push(`<span class="chip fund" title="Fond som eier aksjen">${t.fund}</span>`);
      parts.push(`<span class="chip${n >= 2 ? "" : " dim"}">Utb. <b>${n >= 2 ? fmtPct(t.div) : "?"}</b></span>`);
      const stage = n >= 3 ? "" : n >= 2 ? " blur" : " blur grey";
      parts.push(
        t.logo
          ? `<span class="chip logo-slot"><img class="hint-logo${stage}" src="${t.logo}" alt=""></span>`
          : `<span class="chip logo-slot dim" title="Ingen logo"><svg class="hint-logo none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M11 21v-3h2v3"/></svg></span>`
      );
    }
    el.hints.innerHTML = parts.join("");

    if (state.hints >= MAX_HINTS) {
      el.btnHint.textContent = state.giveUpArmed ? "Sikker?" : "Gi opp";
      el.btnHint.classList.toggle("danger", state.giveUpArmed);
    } else {
      el.btnHint.textContent = state.hints ? `Hint ${state.hints}/${MAX_HINTS}` : "Hint";
      el.btnHint.classList.remove("danger");
    }
  }

  function renderControls() {
    const done = state.status !== "playing";
    el.entry.classList.toggle("hidden", done);
    el.doneBar.classList.toggle("hidden", !done);
    el.btnNext.textContent = state.mode === "daily" ? "Spill frispill" : "Neste selskap";
    el.dailyNum.textContent = shortDate(state.dateKey);
    document.querySelectorAll(".mode-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === state.mode)
    );
  }

  function renderAll(animateLast) {
    renderBoard(animateLast);
    renderHints();
    renderControls();
  }

  /* ---------- result ---------- */

  function shareText() {
    const ICON = { exact: "🟩", close: "🟨", wrong: "⬛" };
    const head = state.mode === "daily" ? `Trygdle ${shortDate(state.dateKey)}` : "Trygdle";
    const score = state.status === "won" ? state.guesses.length : "X";
    const hints = state.hints ? ` · ${state.hints} hint` : "";
    const rows = state.guesses.map((g) => evaluate(g, state.target).tiles.map((t) => ICON[t.s]).join(""));
    return `${head} ${score}/${MAX_GUESSES}${hints}\n\n${rows.join("\n")}\n\n${location.origin}${location.pathname}`;
  }

  function share(e) {
    const text = shareText();
    const btn = e && e.currentTarget;
    const flash = (label) => {
      if (!btn) return toast(label);
      const old = btn.textContent;
      btn.textContent = label;
      setTimeout(() => (btn.textContent = old), 1500);
    };
    if (navigator.share && isTouch()) {
      navigator.share({ text }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => flash("Kopiert ✓"),
        () => flash("Kunne ikke kopiere")
      );
    }
  }

  function countdown() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const sec = Math.max(0, Math.floor((next - now) / 1000));
    const p = (n) => String(n).padStart(2, "0");
    return `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)}`;
  }

  let cdTimer = null;
  function openResult() {
    const t = state.target;
    const won = state.status === "won";
    const grid = state.guesses
      .map(
        (g) =>
          `<div class="mini-row">${evaluate(g, t)
            .tiles.map((x) => `<span class="mini s-${x.s}"></span>`)
            .join("")}</div>`
      )
      .join("");
    const facts = [
      ["Børsverdi", `${fmtB(t.mcapBNOK)} kr`],
      ["P/E", fmtX(t.pe)],
      ["EV/EBITDA", fmtX(t.evEbitda)],
      ["FTF eier", fmtPct(t.ownershipPct)],
      [`FTF-post #${t.rank}`, t.marketValueMNOK >= 1000 ? `${(t.marketValueMNOK / 1000).toFixed(1)} mrd` : `${Math.round(t.marketValueMNOK)} mill`],
      ["Utbytte", fmtPct(t.div)],
      ["Kurs", t.priceNOK ? `${t.priceNOK >= 100 ? Math.round(t.priceNOK) : t.priceNOK.toFixed(2)} kr` : "–"],
      ["Stiftet", t.founded || "–"],
      ["Sektor", t.sector]
    ];
    const kicker = won
      ? `Løst på ${state.guesses.length} av ${MAX_GUESSES}${state.hints ? ` · ${state.hints} hint` : ""}`
      : "Fasit";
    $("result-body").innerHTML = `
      <div class="result-head">
        ${logoImg(t, "result-logo")}
        <div>
          <p class="result-kicker ${won ? "won" : "lost"}">${kicker}</p>
          <h2 class="result-name" id="result-name">${t.name}</h2>
          <p class="result-ticker">${flag(t.iso)}<span>${t.bbgTicker}${t.hq ? ` · ${t.hq.split("/")[0].trim()}` : ""} · ${t.fund}</span></p>
        </div>
      </div>
      <p class="result-desc">${t.clue}</p>
      ${t.ytd ? sparkline(t.ytd) : ""}
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <div class="result-foot">
        <div class="mini-grid" aria-label="Dine forsøk">${grid}</div>
        ${
          state.mode === "daily" && isToday(state.dateKey)
            ? `<div class="cd"><span>Neste selskap</span><b id="cd">${countdown()}</b></div>`
            : ""
        }
      </div>
      <div class="result-actions">
        <button class="ghost-btn" id="btn-share">Del</button>
        <button class="primary-btn" id="btn-result-next">${state.mode === "daily" ? "Spill frispill" : "Neste selskap"}</button>
      </div>`;
    $("btn-share").addEventListener("click", share);
    $("btn-result-next").addEventListener("click", () => {
      closeModal("modal-result");
      nextRound();
    });
    clearInterval(cdTimer);
    if (state.mode === "daily" && isToday(state.dateKey)) {
      cdTimer = setInterval(() => {
        const n = $("cd");
        if (n) n.textContent = countdown();
      }, 1000);
    }
    openModal("modal-result");
  }

  /* ---------- game flow ---------- */

  function submitGuess(company) {
    if (!company || state.status !== "playing" || state.revealing) return;
    if (state.guesses.some((g) => g.id === company.id)) {
      toast("Allerede gjettet", 1600, "error");
      shake();
      return;
    }

    state.guesses.push(company);
    state.giveUpArmed = false;
    el.input.value = "";
    hideAc();

    const won = company.id === state.target.id;
    if (won) state.status = "won";
    else if (state.guesses.length >= MAX_GUESSES) state.status = "lost";

    if (state.status !== "playing" && state.mode === "daily" && isToday(state.dateKey)) recordStats(won, state.guesses.length);
    saveDaily();

    state.revealing = true;
    renderBoard(true);
    renderHints();
    const total = (TILE_COUNT - 1) * FLIP_STAGGER + FLIP_DURATION;
    // Settle tiles into their final state even if animations were paused (e.g. background tab).
    setTimeout(() => el.rows.querySelectorAll(".flip").forEach((t) => t.classList.remove("flip")), total + 1000);
    setTimeout(() => {
      state.revealing = false;
      renderControls();
      if (state.status === "won") {
        toast(WIN_WORDS[state.guesses.length - 1], 2600, "win");
        confetti();
        setTimeout(openResult, 1500);
      } else if (state.status === "lost") {
        renderBoard();
        toast(`Fasit: ${state.target.name}`, 2600);
        setTimeout(openResult, 1800);
      } else if (!isTouch()) {
        el.input.focus();
      }
    }, total);
  }

  function giveUp() {
    if (state.status !== "playing") return;
    state.status = "lost";
    if (state.mode === "daily" && isToday(state.dateKey)) recordStats(false, MAX_GUESSES);
    saveDaily();
    renderAll();
    setTimeout(openResult, 400);
  }

  function onHintClick() {
    if (state.status !== "playing") return;
    if (state.hints < MAX_HINTS) {
      state.hints++;
      saveDaily();
    } else if (!state.giveUpArmed) {
      state.giveUpArmed = true;
      setTimeout(() => {
        state.giveUpArmed = false;
        renderHints();
      }, 3000);
    } else {
      giveUp();
      return;
    }
    renderHints();
  }

  function startRound() {
    const d = dailyInfo();
    state.dailyNumber = d.num;
    state.dateKey = d.dateKey;
    state.guesses = [];
    state.hints = 0;
    state.status = "playing";
    state.giveUpArmed = false;

    if (state.mode === "daily") {
      state.target = d.company;
      loadDaily(d);
    } else {
      let pool = COMPANIES.filter((c) => !state.played.has(c.id) && c.id !== d.company.id);
      if (!pool.length) {
        state.played.clear();
        pool = COMPANIES;
      }
      state.target = pool[Math.floor(Math.random() * pool.length)];
      state.played.add(state.target.id);
    }
    el.input.value = "";
    hideAc();
    renderAll();
  }

  function setMode(mode) {
    if (state.revealing) return;
    state.mode = mode;
    if (mode === "daily") state.day = null;
    startRound();
    if (mode === "daily" && state.status !== "playing") openResult();
  }

  function nextRound() {
    if (state.mode === "daily") setMode("practice");
    else startRound();
  }

  /* ---------- autocomplete ---------- */

  function search(q) {
    const nq = norm(q);
    if (!nq) return [];
    const guessed = new Set(state.guesses.map((g) => g.id));
    return COMPANIES.filter((c) => !guessed.has(c.id))
      .map((c) => {
        const name = norm(c.name);
        const tick = norm(c.ticker);
        const bbg = norm(c.bbgTicker);
        let s = 0;
        if (tick === nq || bbg === nq || name === nq) s = 100;
        else if (tick.startsWith(nq) || bbg.startsWith(nq)) s = 90;
        else if (name.startsWith(nq)) s = 85;
        else if (name.split(" ").some((w) => w.startsWith(nq))) s = 75;
        else if ((c.aliases || []).some((a) => norm(a).includes(nq))) s = 65;
        else if (name.includes(nq)) s = 55;
        return { c, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.c.rank - b.c.rank)
      .slice(0, 6)
      .map((x) => x.c);
  }

  function updateAc() {
    const q = el.input.value;
    const live = $("live-name");
    if (live) live.textContent = q;
    state.acList = search(q);
    state.acIdx = 0;
    if (!q.trim()) return hideAc();
    el.ac.innerHTML = state.acList.length
      ? state.acList
          .map(
            (c, i) => `
          <button type="button" class="ac-row${i === 0 ? " active" : ""}" data-i="${i}" role="option">
            ${logoImg(c)}<span class="ac-name">${c.name}</span><span class="ac-tick">${c.bbgTicker}</span>
          </button>`
          )
          .join("")
      : '<div class="ac-empty">Ingen treff</div>';
    el.ac.classList.remove("hidden");
  }

  function highlightAc() {
    el.ac.querySelectorAll(".ac-row").forEach((r, i) => r.classList.toggle("active", i === state.acIdx));
  }

  function hideAc() {
    el.ac.classList.add("hidden");
    el.ac.innerHTML = "";
  }

  /* ---------- persistence ---------- */

  const dayKey = (d) => `trygdle_day_${d}`;

  function saveDaily() {
    if (state.mode !== "daily") return;
    try {
      localStorage.setItem(
        dayKey(state.dateKey),
        JSON.stringify({
          targetId: state.target.id,
          guessIds: state.guesses.map((g) => g.id),
          hints: state.hints,
          status: state.status
        })
      );
    } catch (e) {}
  }

  function loadDay(dateKey) {
    try {
      return JSON.parse(localStorage.getItem(dayKey(dateKey)) || "null");
    } catch (e) {
      return null;
    }
  }

  function loadDaily(d) {
    const saved = loadDay(d.dateKey);
    if (!saved || saved.targetId !== d.company.id) return;
    state.guesses = saved.guessIds.map((id) => BY_ID.get(id)).filter(Boolean);
    state.hints = saved.hints || 0;
    state.status = saved.status || "playing";
  }

  /* ---------- calendar ---------- */

  const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  let calMonth = null; // Date of the first day of the shown month

  function renderCalendar() {
    const today = dateKeyToday();
    const first = dateOf(START_DATE);
    if (!calMonth) {
      const sel = dateOf(state.mode === "daily" ? state.dateKey : today);
      calMonth = new Date(sel.getFullYear(), sel.getMonth(), 1);
    }
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="cal-day empty"></span>');
    for (let d = 1; d <= days; d++) {
      const key = keyOf(new Date(y, m, d));
      const disabled = key < START_DATE || key > today;
      const saved = disabled ? null : loadDay(key);
      const res = saved && saved.status !== "playing" ? ` ${saved.status}` : saved && saved.guessIds.length ? " started" : "";
      const sel = state.mode === "daily" && key === state.dateKey ? " selected" : "";
      cells.push(
        `<button class="cal-day${res}${sel}${key === today ? " today" : ""}" data-day="${key}"${disabled ? " disabled" : ""}>${d}</button>`
      );
    }
    const prevOk = new Date(y, m, 1) > first;
    const nextOk = new Date(y, m + 1, 1) <= dateOf(today);
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
    $("cal-prev").onclick = () => {
      calMonth = new Date(y, m - 1, 1);
      renderCalendar();
    };
    $("cal-next").onclick = () => {
      calMonth = new Date(y, m + 1, 1);
      renderCalendar();
    };
    $("cal-body").querySelectorAll(".cal-day[data-day]:not([disabled])").forEach((b) => {
      b.onclick = () => playDay(b.dataset.day);
    });
  }

  function openCalendar() {
    calMonth = null;
    renderCalendar();
    openModal("modal-calendar");
  }

  function playDay(key) {
    if (state.revealing) return;
    closeModal("modal-calendar");
    state.mode = "daily";
    state.day = isToday(key) ? null : key;
    startRound();
    if (state.status !== "playing") openResult();
  }

  function getStats() {
    const base = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(STORE_STATS) || "{}") };
    } catch (e) {
      return base;
    }
  }

  function recordStats(won, n) {
    const s = getStats();
    s.played++;
    if (won) {
      s.won++;
      s.currentStreak++;
      s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
      s.dist[n] = (s.dist[n] || 0) + 1;
    } else {
      s.currentStreak = 0;
    }
    try {
      localStorage.setItem(STORE_STATS, JSON.stringify(s));
    } catch (e) {}
  }

  function renderStats() {
    const s = getStats();
    const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    const max = Math.max(1, ...Object.values(s.dist));
    const cur = state.mode === "daily" && state.status === "won" ? state.guesses.length : 0;
    el.statsBody.innerHTML = `
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
            return `<div class="dist-row"><span>${n}</span><div class="bar${n === cur ? " cur" : ""}" style="width:${Math.max(
              7,
              (v / max) * 100
            )}%">${v}</div></div>`;
          })
          .join("")}
      </div>`;
  }

  /* ---------- ui utils ---------- */

  // Lightweight canvas confetti for wins (no library).
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (canvas.width = innerWidth * dpr);
    const H = (canvas.height = innerHeight * dpr);
    const colors = ["#6aaa64", "#c9b458", "#4dabf7", "#ff6b6b", "#ffd43b", "#ffffff"];
    const count = innerWidth < 500 ? 110 : 180;
    const parts = Array.from({ length: count }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 18 * dpr,
      vy: (-Math.random() * 16 - 6) * dpr,
      w: (6 + Math.random() * 6) * dpr,
      h: (3 + Math.random() * 4) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0]
    }));
    const start = performance.now();
    (function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2600);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (t < 2600) requestAnimationFrame(frame);
      else canvas.remove();
    })(start);
  }

  let toastTimer;
  // Short status line in the header (kind: "", "win" or "error").
  function toast(msg, ms = 1600, kind = "") {
    const brand = el.toast.parentElement;
    el.toast.textContent = msg;
    el.toast.className = `status show ${kind}`;
    brand.classList.add("has-status");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove("show");
      brand.classList.remove("has-status");
    }, ms);
  }

  function shake() {
    const row = el.rows.querySelector(".row.active") || el.entry;
    row.classList.remove("shake");
    void row.offsetWidth;
    row.classList.add("shake");
  }

  const isTouch = () => matchMedia("(pointer: coarse)").matches;

  function openModal(id) {
    $(id).classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  function closeModal(id) {
    $(id).classList.add("hidden");
    if (!document.querySelector(".overlay:not(.hidden)")) document.body.classList.remove("modal-open");
    if (id === "modal-result") clearInterval(cdTimer);
  }

  function renderSource() {
    const d = (s) => (s ? s.split("-").reverse().join(".") : "");
    const m = window.MARKET_META || {};
    const p = window.PORTFOLIO_META || {};
    $("source").textContent = `Kurser ${m.source || "Yahoo Finance"} ${d(m.date)} · Beholdning ${d(p.reportDate)}`;
  }

  /* ---------- events ---------- */

  function bind() {
    document.querySelectorAll(".mode-btn").forEach((b) =>
      b.addEventListener("click", () => {
        // Tapping the date while already on a daily puzzle opens the calendar.
        if (b.dataset.mode === "daily" && state.mode === "daily") openCalendar();
        else setMode(b.dataset.mode);
      })
    );

    el.input.addEventListener("input", updateAc);
    el.input.addEventListener("focus", updateAc);
    el.input.addEventListener("keydown", (e) => {
      const n = state.acList.length;
      if (e.key === "ArrowDown" && n) {
        e.preventDefault();
        state.acIdx = (state.acIdx + 1) % n;
        highlightAc();
      } else if (e.key === "ArrowUp" && n) {
        e.preventDefault();
        state.acIdx = (state.acIdx - 1 + n) % n;
        highlightAc();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (n) submitGuess(state.acList[state.acIdx]);
        else if (el.input.value.trim()) {
          toast("Ukjent selskap", 1600, "error");
          shake();
        }
      } else if (e.key === "Escape") {
        hideAc();
      }
    });

    // pointerdown keeps input focus, so the mobile keyboard stays open.
    el.ac.addEventListener("pointerdown", (e) => {
      const row = e.target.closest(".ac-row");
      if (!row) return;
      e.preventDefault();
      submitGuess(state.acList[Number(row.dataset.i)]);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".entry")) hideAc();
    });

    el.btnHint.addEventListener("click", onHintClick);
    $("btn-show-result").addEventListener("click", openResult);
    el.btnNext.addEventListener("click", nextRound);

    // Title = hard refresh: a fresh URL bypasses the cached page.
    $("title-link").addEventListener("click", (e) => {
      e.preventDefault();
      location.replace(`${location.pathname}?r=${Date.now()}`);
    });
    $("btn-help").addEventListener("click", () => openModal("modal-help"));
    $("btn-calendar").addEventListener("click", openCalendar);
    $("btn-stats").addEventListener("click", () => {
      renderStats();
      openModal("modal-stats");
    });
    $("btn-reset-stats").addEventListener("click", () => {
      try {
        localStorage.removeItem(STORE_STATS);
      } catch (e) {}
      renderStats();
      toast("Nullstilt");
    });

    document.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(b.dataset.close))
    );
    document.querySelectorAll(".overlay").forEach((o) =>
      o.addEventListener("click", (e) => {
        if (e.target === o) closeModal(o.id);
      })
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".overlay:not(.hidden)").forEach((o) => closeModal(o.id));
    });
  }

  function init() {
    renderSource();
    bind();
    startRound();
    let firstVisit = false;
    try {
      firstVisit = !localStorage.getItem("folketrygdle_seen_help");
      localStorage.setItem("folketrygdle_seen_help", "1");
    } catch (e) {}
    if (firstVisit) openModal("modal-help");
    else if (state.status !== "playing") openResult();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
