(function () {
  "use strict";

  const MULT = window.PORTFOLIO_MULTIPLES || {};
  const MAJOR = (window.PORTFOLIO_COMPANIES || []).filter((c) => c.isMajorPool);
  // Only companies with live key figures are playable/guessable.
  const COMPANIES = MAJOR.filter((c) => MULT[c.bbgTicker]).map((c) => {
    const m = MULT[c.bbgTicker];
    return {
      ...c,
      pe: m.pe,
      evEbitda: m.evEbitda,
      mcapBNOK: m.mcapBNOK ?? c.mcapBNOK,
      sharePriceNOK: m.priceNOK ?? c.sharePriceNOK
    };
  });

  const MAX_GUESSES = 6;
  const MAX_HINTS = 3;
  const FLIP_STAGGER = 260;
  const FLIP_DURATION = 500;
  const STORE_DAILY = "folketrygdle_daily_v2";
  const STORE_STATS = "folketrygdle_stats_2026";
  const WIN_WORDS = ["Geni!", "Imponerende!", "Strålende!", "Flott!", "Bra!", "Puh!"];

  const COUNTRY = {
    Norge: { lat: 59.91, lon: 10.75, iso: "NO" },
    Sverige: { lat: 59.33, lon: 18.06, iso: "SE" },
    Danmark: { lat: 55.68, lon: 12.57, iso: "DK" },
    Finland: { lat: 60.17, lon: 24.94, iso: "FI" },
    Island: { lat: 64.15, lon: -21.94, iso: "IS" }
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
    Telekommunikasjon: "Telekom"
  };

  const ARROW =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  const CHECK =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const arrow = (deg) => `<i style="transform:rotate(${Math.round(deg)}deg)">${ARROW}</i>`;

  const $ = (id) => document.getElementById(id);
  const el = {
    dailyNum: $("daily-num"),
    rows: $("board-rows"),
    hints: $("hints"),
    entry: $("entry"),
    input: $("guess-input"),
    ac: $("ac"),
    btnHint: $("btn-hint"),
    doneBar: $("done-bar"),
    btnShowResult: $("btn-show-result"),
    btnNext: $("btn-next"),
    resultBody: $("result-body"),
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

  const iso = (c) => c.iso || (COUNTRY[c.country] || {}).iso || "";
  const sectorShort = (s) => SHORT_SECTOR[s] || s;

  function fmtB(b) {
    if (b >= 1000) return `${(b / 1000).toFixed(1).replace(/\.0$/, "")}T`;
    if (b >= 100) return `${Math.round(b)}B`;
    if (b >= 10) return `${b.toFixed(0)}B`;
    return `${b.toFixed(1)}B`;
  }
  const fmtX = (v) => (v == null ? "–" : `${v >= 20 ? Math.round(v) : +v.toFixed(1)}x`);

  function bearing(from, to) {
    const a = COUNTRY[from], b = COUNTRY[to];
    if (!a || !b) return 0;
    const dLat = b.lat - a.lat;
    const dLon = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) * Math.PI) / 360);
    return (Math.atan2(dLon, dLat) * 180) / Math.PI;
  }

  function dateKeyToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dailyInfo() {
    const dateKey = dateKeyToday();
    const epoch = new Date("2026-01-01T00:00:00");
    const num = Math.max(1, Math.floor((new Date(dateKey + "T00:00:00") - epoch) / 86400000) + 1);
    let h = 2166136261;
    for (let i = 0; i < dateKey.length; i++) {
      h ^= dateKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // Hash over the full pool so the daily pick stays stable when data coverage changes;
    // step forward to the next company that has key figures.
    const start = Math.abs(h) % MAJOR.length;
    let company = COMPANIES[0];
    for (let i = 0; i < MAJOR.length; i++) {
      const found = COMPANIES.find((c) => c.id === MAJOR[(start + i) % MAJOR.length].id);
      if (found) {
        company = found;
        break;
      }
    }
    return { dateKey, num, company };
  }

  /* ---------- evaluation ---------- */

  function evalNum(g, t, closeRatio, fmt, isWin) {
    if (g == null && t == null) return { s: "exact", v: "–", icon: "" };
    if (g == null) return { s: "wrong", v: "–", icon: "" };
    if (t == null) return { s: "wrong", v: fmt(g), icon: '<i class="na">–</i>' };
    if (isWin || g === t) return { s: "exact", v: fmt(g), icon: `<i>${CHECK}</i>` };
    const diff = Math.abs(g - t) / Math.max(Math.abs(t), 0.01);
    const ratio = Math.max(g, t) / Math.max(Math.min(g, t), 0.01);
    const s = diff <= 0.15 ? "exact" : ratio <= closeRatio ? "close" : "wrong";
    return { s, v: fmt(g), icon: arrow(t > g ? 0 : 180) };
  }

  function evaluate(g, t) {
    const win = g.id === t.id;
    const sameCountry = g.country === t.country;
    const sameSector = g.sector === t.sector;
    const related = SECTOR_CLUSTER[g.sector] === SECTOR_CLUSTER[t.sector];
    return {
      win,
      tiles: [
        {
          s: sameCountry ? "exact" : "wrong",
          v: iso(g),
          icon: sameCountry ? `<i>${CHECK}</i>` : arrow(bearing(g.country, t.country)),
          title: g.country
        },
        {
          s: sameSector ? "exact" : related ? "close" : "wrong",
          v: sectorShort(g.sector),
          icon: "",
          title: g.sector,
          small: true
        },
        evalNum(g.mcapBNOK, t.mcapBNOK, 2, fmtB, win),
        evalNum(g.pe, t.pe, 1.5, fmtX, win),
        evalNum(g.evEbitda, t.evEbitda, 1.5, fmtX, win)
      ]
    };
  }

  /* ---------- rendering ---------- */

  function tileHtml(t, animate, i, win) {
    const flipDelay = i * FLIP_STAGGER;
    const bounceDelay = 4 * FLIP_STAGGER + FLIP_DURATION + i * 90;
    const delay = animate
      ? ` style="animation-delay:${flipDelay}ms${win ? `, ${bounceDelay}ms` : ""}"`
      : "";
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
            <div class="row-name">${g.name}<span>${g.bbgTicker}</span></div>
            <div class="tiles">${ev.tiles.map((t, i) => tileHtml(t, anim, i, ev.win)).join("")}</div>
          </div>`);
      } else {
        const active = r === state.guesses.length && state.status === "playing";
        html.push(`
          <div class="row empty${active ? " active" : ""}">
            <div class="row-name">${active ? '<em id="live-name"></em>' : "&nbsp;"}</div>
            <div class="tiles">${'<div class="tile"></div>'.repeat(5)}</div>
          </div>`);
      }
    }
    el.rows.innerHTML = html.join("");
  }

  function maskName(text, c) {
    let out = text;
    [c.name, ...(c.aliases || [])]
      .filter((p) => p && p.length >= 3)
      .forEach((p) => {
        out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "___");
      });
    return out;
  }

  function hintTexts(t) {
    return [
      `Folketrygdfondet eier <b>${t.ownershipPct.toFixed(2)} %</b> · post nr. <b>${t.rank}</b> i porteføljen`,
      `Hovedkontor i <b>${t.hq}</b> · navnet starter på <b>${t.name[0]}</b>`,
      maskName(t.clue, t)
    ];
  }

  function renderHints() {
    const t = state.target;
    const shown = state.status === "playing" ? state.hints : 0;
    el.hints.innerHTML = hintTexts(t)
      .slice(0, shown)
      .map((h, i) => `<p><span class="n">${i + 1}</span><span>${h}</span></p>`)
      .join("");

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
    el.dailyNum.textContent = `#${state.dailyNumber}`;
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
    const head = state.mode === "daily" ? `Folketrygdle #${state.dailyNumber}` : "Folketrygdle (frispill)";
    const score = state.status === "won" ? state.guesses.length : "X";
    const hints = state.hints ? ` · ${state.hints} hint` : "";
    const rows = state.guesses.map((g) =>
      evaluate(g, state.target).tiles.map((t) => ICON[t.s]).join("")
    );
    return `${head} ${score}/${MAX_GUESSES}${hints}\n\n${rows.join("\n")}\n\n${location.origin}${location.pathname}`;
  }

  function share() {
    const text = shareText();
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => toast("Kopiert til utklippstavlen"),
        () => toast("Kunne ikke kopiere")
      );
    }
  }

  function countdown() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const p = (n) => String(n).padStart(2, "0");
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  let cdTimer = null;
  function openResult() {
    const t = state.target;
    const won = state.status === "won";
    const facts = [
      ["Land", `${t.country}`],
      ["Sektor", t.sector],
      ["Børsverdi", `${fmtB(t.mcapBNOK)} NOK`],
      ["P/E", fmtX(t.pe)],
      ["EV/EBITDA", fmtX(t.evEbitda)],
      ["FTF eier", `${t.ownershipPct.toFixed(2)} %`]
    ];
    el.resultBody.innerHTML = `
      <p class="result-kicker">${won ? `Løst på ${state.guesses.length}/${MAX_GUESSES}` : "Ikke denne gangen"}</p>
      <h2 class="result-name" id="result-name">${t.name}</h2>
      <p class="result-ticker">${t.bbgTicker} · ${t.hq}</p>
      <p class="result-desc">${t.clue}</p>
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      ${
        state.mode === "daily"
          ? `<div class="result-foot">
              <div class="cd"><span>Neste selskap om</span><b id="cd">${countdown()}</b></div>
              <button class="primary-btn share" id="btn-share">Del</button>
            </div>
            <button class="ghost-btn wide" id="btn-result-next">Spill frispill</button>`
          : `<div class="result-foot">
              <button class="ghost-btn" id="btn-share">Del</button>
              <button class="primary-btn" id="btn-result-next">Neste selskap</button>
            </div>`
      }`;
    $("btn-share").addEventListener("click", share);
    $("btn-result-next").addEventListener("click", () => {
      closeModal("modal-result");
      nextRound();
    });
    clearInterval(cdTimer);
    if (state.mode === "daily") {
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
      toast("Allerede gjettet");
      shakeActiveRow();
      return;
    }

    state.guesses.push(company);
    state.giveUpArmed = false;
    el.input.value = "";
    hideAc();

    const won = company.id === state.target.id;
    if (won) state.status = "won";
    else if (state.guesses.length >= MAX_GUESSES) state.status = "lost";

    if (state.status !== "playing" && state.mode === "daily") recordStats(won, state.guesses.length);
    saveDaily();

    state.revealing = true;
    renderBoard(true);
    renderHints();
    const total = 4 * FLIP_STAGGER + FLIP_DURATION;
    // Settle tiles into their final state even if animations were paused (e.g. background tab).
    setTimeout(() => el.rows.querySelectorAll(".flip").forEach((t) => t.classList.remove("flip")), total + 1000);
    setTimeout(() => {
      state.revealing = false;
      renderControls();
      if (state.status === "won") {
        toast(WIN_WORDS[state.guesses.length - 1]);
        setTimeout(openResult, 1300);
      } else if (state.status === "lost") {
        toast(state.target.name, 2500);
        setTimeout(openResult, 1600);
      } else if (!isTouch()) {
        el.input.focus();
      }
    }, total);
  }

  function giveUp() {
    if (state.status !== "playing") return;
    state.status = "lost";
    if (state.mode === "daily") recordStats(false, MAX_GUESSES);
    saveDaily();
    renderAll();
    openResult();
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
        const words = name.split(" ");
        let s = 0;
        if (tick === nq || bbg === nq || name === nq) s = 100;
        else if (tick.startsWith(nq) || bbg.startsWith(nq)) s = 90;
        else if (name.startsWith(nq)) s = 85;
        else if (words.some((w) => w.startsWith(nq))) s = 75;
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
    if (!state.acList.length) {
      el.ac.innerHTML = '<div class="ac-empty">Ingen treff</div>';
    } else {
      el.ac.innerHTML = state.acList
        .map(
          (c, i) => `
          <button type="button" class="ac-row${i === 0 ? " active" : ""}" data-i="${i}" role="option">
            <span class="ac-name">${c.name}</span>
            <span class="ac-tick">${c.bbgTicker}</span>
          </button>`
        )
        .join("");
    }
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

  function saveDaily() {
    if (state.mode !== "daily") return;
    try {
      localStorage.setItem(
        STORE_DAILY,
        JSON.stringify({
          dateKey: state.dateKey,
          targetId: state.target.id,
          guessIds: state.guesses.map((g) => g.id),
          hints: state.hints,
          status: state.status
        })
      );
    } catch (e) {}
  }

  function loadDaily(d) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_DAILY) || "null");
      if (!saved || saved.dateKey !== d.dateKey || saved.targetId !== d.company.id) return;
      state.guesses = saved.guessIds.map((id) => COMPANIES.find((c) => c.id === id)).filter(Boolean);
      state.hints = saved.hints || 0;
      state.status = saved.status || "playing";
    } catch (e) {}
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
        <div><b>${pct}</b><span>Seier %</span></div>
        <div><b>${s.currentStreak}</b><span>Streak</span></div>
        <div><b>${s.maxStreak}</b><span>Beste</span></div>
      </div>
      <h3 class="dist-title">Fordeling</h3>
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
      </div>
      <p class="stats-note">Kun daglige runder teller.</p>`;
  }

  /* ---------- ui utils ---------- */

  let toastTimer;
  function toast(msg, ms = 1600) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms);
  }

  function shakeActiveRow() {
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

  /* ---------- events ---------- */

  function bind() {
    document.querySelectorAll(".mode-btn").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode))
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
          toast("Fant ikke selskapet");
          shakeActiveRow();
        }
      } else if (e.key === "Escape") {
        hideAc();
      }
    });

    // pointerdown so the input keeps focus (keyboard stays open on mobile)
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
    el.btnShowResult.addEventListener("click", openResult);
    el.btnNext.addEventListener("click", nextRound);

    $("btn-help").addEventListener("click", () => openModal("modal-help"));
    $("btn-stats").addEventListener("click", () => {
      renderStats();
      openModal("modal-stats");
    });
    $("btn-reset-stats").addEventListener("click", () => {
      try {
        localStorage.removeItem(STORE_STATS);
      } catch (e) {}
      renderStats();
      toast("Statistikk nullstilt");
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

  function renderSource() {
    const meta = window.MULTIPLES_META || {};
    const pMeta = window.PORTFOLIO_META || {};
    const fmtDate = (d) => (d ? d.split("-").reverse().join(".") : "");
    $("source").textContent =
      `Kurs og multipler: ${meta.source || "Yahoo Finance"} ${fmtDate(meta.date)} · ` +
      `FTF-beholdning ${fmtDate(pMeta.reportDate)}`;
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
