(function () {
  "use strict";

  const COMPANIES = window.PORTFOLIO_COMPANIES || [];
  const MAX_GUESSES = 6;

  const COUNTRY_COORDS = {
    Norge: { lat: 59.91, lon: 10.75, iso: "NO" },
    Sverige: { lat: 59.33, lon: 18.06, iso: "SE" },
    Danmark: { lat: 55.68, lon: 12.57, iso: "DK" },
    Finland: { lat: 60.17, lon: 24.94, iso: "FI" },
    Island: { lat: 64.15, lon: -21.94, iso: "IS" }
  };

  const SECTOR_CLUSTERS = {
    Energi: "ENERGI_KRAFT",
    Forsyning: "ENERGI_KRAFT",
    Industri: "INDUSTRI_MAT",
    Materialer: "INDUSTRI_MAT",
    Konsumvarer: "KONSUM",
    "Varige konsumvarer": "KONSUM",
    Teknologi: "TECH_TELE",
    Telekommunikasjon: "TECH_TELE",
    Finans: "FINANS_EIENDOM",
    Eiendom: "FINANS_EIENDOM",
    Helse: "HELSE"
  };

  const SHORT_SECTOR = {
    Energi: "Energi",
    Forsyning: "Forsyning",
    Industri: "Industri",
    Materialer: "Materialer",
    Konsumvarer: "Konsum",
    "Varige konsumvarer": "Varig konsum",
    Teknologi: "Teknologi",
    Telekommunikasjon: "Telekom",
    Finans: "Finans",
    Eiendom: "Eiendom",
    Helse: "Helse"
  };

  const ALL_SECTORS = Object.keys(SECTOR_CLUSTERS);

  // Clean inline SVGs (12px)
  const SVG = {
    up: '<svg class="svg-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    down: '<svg class="svg-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
    check: '<svg class="svg-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    bulb: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    tag: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>'
  };

  function compassSvg(deg) {
    return `<svg class="svg-arrow" style="transform:rotate(${Math.round(deg)}deg)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
  }

  let state = {
    mode: "daily",
    target: null,
    guesses: [],
    unlockedClues: { 1: false, 2: false, 3: false },
    status: "playing",
    dailyNumber: 1,
    dailyDateKey: "",
    candidatesOpen: false,
    acHighlightIdx: 0,
    acFiltered: [],
    playedIds: new Set()
  };

  const el = {
    roundLabel: document.getElementById("round-label"),
    attemptDots: document.getElementById("attempt-dots"),
    btnClue1: document.getElementById("btn-clue-1"),
    btnClue2: document.getElementById("btn-clue-2"),
    btnClue3: document.getElementById("btn-clue-3"),
    clueDisplayBox: document.getElementById("clue-display-box"),
    clueItems: document.getElementById("clue-items"),
    btnToggleCandidates: document.getElementById("btn-toggle-candidates"),
    candidateCountText: document.getElementById("candidate-count-text"),
    candidateChevron: document.getElementById("candidate-chevron"),
    candidatesDrawer: document.getElementById("candidates-drawer"),
    deductionSummary: document.getElementById("deduction-summary"),
    candidatesChipsGrid: document.getElementById("candidates-chips-grid"),
    candidateSortSelect: document.getElementById("candidate-sort-select"),
    searchInput: document.getElementById("company-search-input"),
    chkSmartFilter: document.getElementById("chk-smart-filter"),
    btnSubmitGuess: document.getElementById("btn-submit-guess"),
    acDropdown: document.getElementById("autocomplete-dropdown"),
    resultBanner: document.getElementById("result-banner"),
    guessesList: document.getElementById("guesses-list"),
    emptySlotsList: document.getElementById("empty-slots-list"),
    btnNewRound: document.getElementById("btn-new-round"),
    btnGiveUp: document.getElementById("btn-give-up"),
    btnExplorer: document.getElementById("btn-explorer"),
    btnStats: document.getElementById("btn-stats"),
    btnHelp: document.getElementById("btn-help"),
    modalExplorer: document.getElementById("modal-explorer"),
    modalStats: document.getElementById("modal-stats"),
    modalHelp: document.getElementById("modal-help"),
    explorerSearch: document.getElementById("explorer-search"),
    explorerCountry: document.getElementById("explorer-country"),
    explorerSector: document.getElementById("explorer-sector"),
    explorerFund: document.getElementById("explorer-fund"),
    explorerSort: document.getElementById("explorer-sort"),
    explorerSummaryStrip: document.getElementById("explorer-summary-strip"),
    explorerTbody: document.getElementById("explorer-tbody"),
    statsKpiGrid: document.getElementById("stats-kpi-grid"),
    statsDistribution: document.getElementById("stats-distribution"),
    btnResetStats: document.getElementById("btn-reset-stats"),
    toast: document.getElementById("toast")
  };

  function getBbg(c) {
    if (c.bbgTicker) return c.bbgTicker;
    const suffixMap = { Norge: "NO", Sverige: "SS", Danmark: "DC", Finland: "FH", Island: "IR" };
    return `${(c.ticker || "").replace("-", "")} ${suffixMap[c.country] || "NO"}`;
  }

  function getIso(c) {
    if (c.iso) return c.iso;
    return (COUNTRY_COORDS[c.country] && COUNTRY_COORDS[c.country].iso) || "NO";
  }

  function fmtCompactNOK(bnok) {
    if (bnok >= 100) return `${Math.round(bnok)}B`;
    if (bnok >= 10) return `${bnok.toFixed(1)}B`;
    return `${bnok.toFixed(2)}B`;
  }

  function fmtCompactFTF(mnok) {
    if (mnok >= 1000) return `${(mnok / 1000).toFixed(1)}B`;
    return `${Math.round(mnok)}M`;
  }

  function getActivePool(mode = state.mode) {
    if (mode === "daily" || mode === "practice-major") {
      return COMPANIES.filter((c) => c.isMajorPool);
    }
    if (mode === "practice-norway") {
      return COMPANIES.filter((c) => c.country === "Norge");
    }
    return COMPANIES;
  }

  function getCompassIcon(fromCountry, toCountry) {
    if (fromCountry === toCountry) return SVG.check;
    const c1 = COUNTRY_COORDS[fromCountry];
    const c2 = COUNTRY_COORDS[toCountry];
    if (!c1 || !c2) return "";
    const dLat = c2.lat - c1.lat;
    const dLon = (c2.lon - c1.lon) * Math.cos(((c1.lat + c2.lat) * Math.PI) / 360);
    const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    return compassSvg(angle);
  }

  function evaluateGuess(guess, target) {
    const isWin = guess.id === target.id;

    // 1. Country
    const countryExact = guess.country === target.country;
    const countryEval = {
      state: countryExact ? "exact" : "wrong",
      iso: getIso(guess),
      icon: getCompassIcon(guess.country, target.country),
      code: countryExact ? "[=]" : "[x]"
    };

    // 2. Sector
    const sectorExact = guess.sector === target.sector;
    const sameCluster = SECTOR_CLUSTERS[guess.sector] === SECTOR_CLUSTERS[target.sector];
    const sectorState = sectorExact ? "exact" : sameCluster ? "close" : "wrong";
    const sectorEval = {
      state: sectorState,
      name: SHORT_SECTOR[guess.sector] || guess.sector,
      code: sectorExact ? "[=]" : sameCluster ? "[~]" : "[x]"
    };

    // 3. Market Cap
    const mcapRatio =
      Math.max(guess.mcapBNOK, target.mcapBNOK) /
      Math.max(Math.min(guess.mcapBNOK, target.mcapBNOK), 0.05);
    const mcapDiffPct = Math.abs(guess.mcapBNOK - target.mcapBNOK) / Math.max(target.mcapBNOK, 0.1);
    const mcapState = isWin || mcapDiffPct <= 0.15 ? "exact" : mcapRatio <= 2.2 ? "close" : "wrong";
    const mcapHigher = target.mcapBNOK > guess.mcapBNOK;
    const mcapIcon =
      isWin || guess.mcapBNOK === target.mcapBNOK ? SVG.check : mcapHigher ? SVG.up : SVG.down;

    const mcapEval = {
      state: mcapState,
      val: fmtCompactNOK(guess.mcapBNOK),
      icon: mcapIcon,
      code: mcapState === "exact" ? "[=]" : mcapHigher ? "[^]" : "[v]"
    };

    // 4. FTF Holding & Rank
    const ftfRatio =
      Math.max(guess.marketValueMNOK, target.marketValueMNOK) /
      Math.max(Math.min(guess.marketValueMNOK, target.marketValueMNOK), 0.05);
    const rankDiff = Math.abs(guess.rank - target.rank);
    const ftfState =
      isWin || ftfRatio <= 1.18 || rankDiff <= 5
        ? "exact"
        : ftfRatio <= 2.3 || rankDiff <= 25
        ? "close"
        : "wrong";
    const ftfHigher = target.marketValueMNOK > guess.marketValueMNOK;
    const ftfIcon =
      isWin || guess.rank === target.rank ? SVG.check : ftfHigher ? SVG.up : SVG.down;

    const ftfEval = {
      state: ftfState,
      val: fmtCompactFTF(guess.marketValueMNOK),
      rank: `#${guess.rank}`,
      icon: ftfIcon,
      code: ftfState === "exact" ? "[=]" : ftfHigher ? "[^]" : "[v]"
    };

    // 5. FTF Ownership %
    const ownAbsDiff = Math.abs(guess.ownershipPct - target.ownershipPct);
    const ownRelDiff = ownAbsDiff / Math.max(target.ownershipPct, 0.05);
    const ownState =
      isWin || ownAbsDiff <= 0.5 || ownRelDiff <= 0.15
        ? "exact"
        : ownAbsDiff <= 2.2 || ownRelDiff <= 0.55
        ? "close"
        : "wrong";
    const ownHigher = target.ownershipPct > guess.ownershipPct;
    const ownIcon =
      isWin || guess.ownershipPct === target.ownershipPct
        ? SVG.check
        : ownHigher
        ? SVG.up
        : SVG.down;

    const ownEval = {
      state: ownState,
      val: `${guess.ownershipPct.toFixed(1)}%`,
      icon: ownIcon,
      code: ownState === "exact" ? "[=]" : ownHigher ? "[^]" : "[v]"
    };

    return {
      isWin,
      country: countryEval,
      sector: sectorEval,
      mcap: mcapEval,
      ftf: ftfEval,
      own: ownEval
    };
  }

  function computeDeductions() {
    const t = state.target;
    const guessedIds = new Set(state.guesses.map((g) => g.id));

    let confirmedCountry = null;
    const eliminatedCountries = new Set();

    let confirmedSector = null;
    let relatedCluster = null;
    const eliminatedSectors = new Set();

    let minMcap = 0;
    let maxMcap = Infinity;

    let minRank = 1;
    let maxRank = COMPANIES.length;

    let minOwn = 0;
    let maxOwn = 100;

    for (const g of state.guesses) {
      if (g.id === t.id) {
        confirmedCountry = t.country;
        confirmedSector = t.sector;
        minMcap = maxMcap = t.mcapBNOK;
        minRank = maxRank = t.rank;
        minOwn = maxOwn = t.ownershipPct;
        break;
      }

      if (g.country === t.country) {
        confirmedCountry = t.country;
      } else {
        eliminatedCountries.add(g.country);
      }

      if (g.sector === t.sector) {
        confirmedSector = t.sector;
      } else if (SECTOR_CLUSTERS[g.sector] === SECTOR_CLUSTERS[t.sector]) {
        relatedCluster = SECTOR_CLUSTERS[t.sector];
        eliminatedSectors.add(g.sector);
      } else {
        const gCluster = SECTOR_CLUSTERS[g.sector];
        for (const s of ALL_SECTORS) {
          if (SECTOR_CLUSTERS[s] === gCluster) {
            eliminatedSectors.add(s);
          }
        }
      }

      if (t.mcapBNOK > g.mcapBNOK) {
        minMcap = Math.max(minMcap, g.mcapBNOK);
      } else if (t.mcapBNOK < g.mcapBNOK) {
        maxMcap = Math.min(maxMcap, g.mcapBNOK);
      }

      if (t.marketValueMNOK > g.marketValueMNOK) {
        maxRank = Math.min(maxRank, g.rank - 1);
      } else if (t.marketValueMNOK < g.marketValueMNOK) {
        minRank = Math.max(minRank, g.rank + 1);
      }

      if (t.ownershipPct > g.ownershipPct) {
        minOwn = Math.max(minOwn, g.ownershipPct);
      } else if (t.ownershipPct < g.ownershipPct) {
        maxOwn = Math.min(maxOwn, g.ownershipPct);
      }
    }

    if (confirmedSector) {
      for (const s of ALL_SECTORS) {
        if (s !== confirmedSector) eliminatedSectors.add(s);
      }
    } else if (relatedCluster) {
      for (const s of ALL_SECTORS) {
        if (SECTOR_CLUSTERS[s] !== relatedCluster) eliminatedSectors.add(s);
      }
    }

    const pool = getActivePool();
    const candidates = pool.filter((c) => {
      if (state.status === "playing" && guessedIds.has(c.id)) return false;
      if (confirmedCountry && c.country !== confirmedCountry) return false;
      if (eliminatedCountries.has(c.country)) return false;
      if (confirmedSector && c.sector !== confirmedSector) return false;
      if (eliminatedSectors.has(c.sector)) return false;
      if (c.mcapBNOK < minMcap || c.mcapBNOK > maxMcap) return false;
      if (c.rank < minRank || c.rank > maxRank) return false;
      if (c.ownershipPct < minOwn || c.ownershipPct > maxOwn) return false;
      return true;
    });

    return {
      confirmedCountry,
      confirmedSector,
      minMcap,
      maxMcap,
      minRank,
      maxRank,
      minOwn,
      maxOwn,
      candidates
    };
  }

  function getTodayDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getDailyPuzzleInfo() {
    const dateKey = getTodayDateKey();
    const epoch = new Date("2026-01-01T00:00:00");
    const now = new Date();
    const diffDays = Math.max(1, Math.floor((now - epoch) / (1000 * 60 * 60 * 24)) + 1);
    const majorPool = getActivePool("daily");

    let hash = 2166136261;
    for (let i = 0; i < dateKey.length; i++) {
      hash ^= dateKey.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % majorPool.length;
    return {
      dateKey,
      dailyNumber: diffDays,
      company: majorPool[idx]
    };
  }

  function maskCompanyName(clueText, company) {
    let masked = clueText;
    const parts = [company.name, ...(company.aliases || [])].filter((x) => x && x.length >= 3);
    for (const p of parts) {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      masked = masked.replace(regex, "___");
    }
    return masked;
  }

  function renderToolbarAndHints() {
    const t = state.target;
    if (!t) return;

    el.roundLabel.textContent =
      state.mode === "daily" ? `#${state.dailyNumber}` : state.mode === "practice-norway" ? "NO" : "2026";

    // Render 6 attempt dots
    const dots = [];
    for (let i = 0; i < MAX_GUESSES; i++) {
      let cls = "attempt-dot";
      if (i < state.guesses.length) {
        cls += state.guesses[i].id === t.id ? " won" : " used";
      }
      dots.push(`<span class="${cls}"></span>`);
    }
    el.attemptDots.innerHTML = dots.join("");

    el.btnClue1.classList.toggle("unlocked", Boolean(state.unlockedClues[1]));
    el.btnClue2.classList.toggle("unlocked", Boolean(state.unlockedClues[2]));
    el.btnClue3.classList.toggle("unlocked", Boolean(state.unlockedClues[3]));

    const lines = [];
    if (state.unlockedClues[1]) {
      lines.push({
        icon: SVG.bulb,
        text: maskCompanyName(t.clue, t)
      });
    }
    if (state.unlockedClues[2]) {
      lines.push({
        icon: SVG.pin,
        text: `${t.hq} · Kurs: ~${Math.round(t.sharePriceNOK)} NOK · ${t.fund}`
      });
    }
    if (state.unlockedClues[3]) {
      const bbg = getBbg(t);
      const parts = bbg.split(" ");
      const root = parts[0];
      const exch = parts[1] || "";
      const maskedBbg =
        root.length > 2
          ? `${root[0]}${"·".repeat(root.length - 2)}${root[root.length - 1]} ${exch}`
          : `${root[0]}· ${exch}`;
      lines.push({
        icon: SVG.tag,
        text: `Navn: ${t.name[0].toUpperCase()}… (${t.name.length}) · BBG: ${maskedBbg}`
      });
    }

    if (lines.length === 0) {
      el.clueDisplayBox.classList.add("hidden");
      el.clueItems.innerHTML = "";
    } else {
      el.clueDisplayBox.classList.remove("hidden");
      el.clueItems.innerHTML = lines
        .map(
          (l) => `
          <div class="clue-row">
            <span class="clue-icon">${l.icon}</span>
            <span>${l.text}</span>
          </div>`
        )
        .join("");
    }
  }

  function renderCandidatesPanel() {
    const ded = computeDeductions();
    el.candidateCountText.textContent = String(ded.candidates.length);
    el.candidateChevron.classList.toggle("open", state.candidatesOpen);

    const pills = [];
    if (ded.confirmedCountry) {
      const iso = (COUNTRY_COORDS[ded.confirmedCountry] || {}).iso || ded.confirmedCountry;
      pills.push(`<span class="ded-pill"><strong>${iso}</strong></span>`);
    }
    if (ded.confirmedSector) {
      pills.push(`<span class="ded-pill"><strong>${SHORT_SECTOR[ded.confirmedSector] || ded.confirmedSector}</strong></span>`);
    }
    if (ded.minMcap > 0 || ded.maxMcap < Infinity) {
      const mcapTxt =
        ded.minMcap > 0 && ded.maxMcap < Infinity
          ? `${fmtCompactNOK(ded.minMcap)}–${fmtCompactNOK(ded.maxMcap)}`
          : ded.minMcap > 0
          ? `>${fmtCompactNOK(ded.minMcap)}`
          : `<${fmtCompactNOK(ded.maxMcap)}`;
      pills.push(`<span class="ded-pill">MCap <strong>${mcapTxt}</strong></span>`);
    }
    if (ded.minRank > 1 || ded.maxRank < COMPANIES.length) {
      pills.push(`<span class="ded-pill"><strong>#${ded.minRank}–#${ded.maxRank}</strong></span>`);
    }
    if (ded.minOwn > 0 || ded.maxOwn < 100) {
      const ownTxt =
        ded.minOwn > 0 && ded.maxOwn < 100
          ? `${ded.minOwn.toFixed(1)}–${ded.maxOwn.toFixed(1)}%`
          : ded.minOwn > 0
          ? `>${ded.minOwn.toFixed(1)}%`
          : `<${ded.maxOwn.toFixed(1)}%`;
      pills.push(`<span class="ded-pill">Eier <strong>${ownTxt}</strong></span>`);
    }
    el.deductionSummary.innerHTML = pills.join("");

    const sortBy = el.candidateSortSelect.value;
    const sorted = [...ded.candidates].sort((a, b) => {
      if (sortBy === "mcap") return b.mcapBNOK - a.mcapBNOK;
      if (sortBy === "own") return b.ownershipPct - a.ownershipPct;
      if (sortBy === "name") return a.name.localeCompare(b.name, "nb");
      return a.rank - b.rank;
    });

    el.candidatesChipsGrid.innerHTML = sorted
      .map(
        (c) => `
        <button class="cand-btn" data-id="${c.id}">
          <div class="cand-info">
            <div class="cand-title">${c.name}</div>
            <div class="cand-bbg">${getBbg(c)} · ${SHORT_SECTOR[c.sector] || c.sector}</div>
          </div>
          <div class="cand-num">
            <div>${fmtCompactNOK(c.mcapBNOK)}</div>
            <div>#${c.rank}</div>
          </div>
        </button>`
      )
      .join("");

    el.candidatesChipsGrid.querySelectorAll(".cand-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const comp = COMPANIES.find((x) => x.id === btn.getAttribute("data-id"));
        if (comp) submitGuess(comp);
      });
    });
  }

  function renderGrid() {
    el.guessesList.innerHTML = state.guesses
      .map((g) => {
        const ev = evaluateGuess(g, state.target);
        return `
        <div class="grid-row">
          <div class="cell cell-company ${ev.isWin ? "state-exact" : ""}">
            <span class="cell-company-name" title="${g.name}">${g.name}</span>
            <span class="cell-bbg-tag">${getBbg(g)}</span>
          </div>

          <div class="cell state-${ev.country.state}" title="${g.country}">
            <span>${ev.country.iso}</span>
            ${ev.country.icon}
          </div>

          <div class="cell state-${ev.sector.state}" title="${g.sector}">
            <span class="sector-cell-text">${ev.sector.name}</span>
          </div>

          <div class="cell state-${ev.mcap.state} cell-mono">
            <span>${ev.mcap.val}</span>
            ${ev.mcap.icon}
          </div>

          <div class="cell state-${ev.ftf.state} cell-mono">
            <span>${ev.ftf.val}</span>
            <span class="rank-sub">${ev.ftf.rank}</span>
            ${ev.ftf.icon}
          </div>

          <div class="cell state-${ev.own.state} cell-mono">
            <span>${ev.own.val}</span>
            ${ev.own.icon}
          </div>
        </div>`;
      })
      .join("");

    const remaining = Math.max(0, MAX_GUESSES - state.guesses.length);
    const emptyRows = [];
    for (let i = 0; i < remaining; i++) {
      emptyRows.push(`
        <div class="empty-row">
          <div class="empty-cell"></div>
          <div class="empty-cell"></div>
          <div class="empty-cell"></div>
          <div class="empty-cell"></div>
          <div class="empty-cell"></div>
          <div class="empty-cell"></div>
        </div>`);
    }
    el.emptySlotsList.innerHTML = emptyRows.join("");
  }

  function renderResultBanner() {
    if (state.status === "playing") {
      el.resultBanner.classList.add("hidden");
      el.searchInput.disabled = false;
      el.btnSubmitGuess.disabled = false;
      el.btnGiveUp.classList.remove("hidden");
      return;
    }

    el.searchInput.disabled = true;
    el.btnSubmitGuess.disabled = true;
    el.btnGiveUp.classList.add("hidden");

    const t = state.target;
    const isWon = state.status === "won";
    el.resultBanner.classList.remove("hidden", "lost");
    if (!isWon) el.resultBanner.classList.add("lost");

    el.resultBanner.innerHTML = `
      <div class="result-header">
        <div class="result-title-group">
          <span class="result-title">${t.name}</span>
          <span class="bbg-pill">${getBbg(t)}</span>
        </div>
        <div class="result-actions">
          <button id="btn-share-result" class="action-btn" title="Kopier resultat">${SVG.copy}<span>Del</span></button>
          <button id="btn-play-again-banner" class="action-btn primary">${SVG.refresh}<span>Ny</span></button>
        </div>
      </div>

      <p class="result-desc">${t.clue}</p>

      <div class="result-stats">
        <span class="res-pill"><strong>${getIso(t)}</strong> · ${t.hq}</span>
        <span class="res-pill"><strong>${t.sector}</strong></span>
        <span class="res-pill">MCap <strong>${fmtCompactNOK(t.mcapBNOK)} NOK</strong></span>
        <span class="res-pill">FTF <strong>${fmtCompactFTF(t.marketValueMNOK)} (#${t.rank})</strong></span>
        <span class="res-pill">Eier <strong>${t.ownershipPct.toFixed(2)}%</strong></span>
        <span class="res-pill">Kurs <strong>${Math.round(t.sharePriceNOK)} kr</strong></span>
      </div>
    `;

    document.getElementById("btn-share-result").addEventListener("click", copyShareResult);
    document.getElementById("btn-play-again-banner").addEventListener("click", () => {
      if (state.mode === "daily") {
        setMode("practice-major");
      } else {
        startNewRound();
      }
    });
  }

  function copyShareResult() {
    const modeTitle =
      state.mode === "daily" ? `Folketrygdle #${state.dailyNumber}` : `Folketrygdle`;
    const score =
      state.status === "won" ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;

    const rows = state.guesses.map((g) => {
      const ev = evaluateGuess(g, state.target);
      return `${ev.country.code}${ev.sector.code}${ev.mcap.code}${ev.ftf.code}${ev.own.code}`;
    });

    const text = `${modeTitle} ${score}\n${rows.join("\n")}\nhttps://egil10.github.io/compquiz/`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("Kopiert");
      });
    } else {
      showToast("Kopiert");
    }
  }

  function submitGuess(company) {
    if (!company || state.status !== "playing") return;
    if (state.guesses.some((g) => g.id === company.id)) {
      showToast(`Allerede gjettet: ${company.name}`);
      return;
    }

    state.guesses.push(company);
    el.searchInput.value = "";
    hideAutocomplete();

    if (state.guesses.length >= 2) state.unlockedClues[1] = true;
    if (state.guesses.length >= 4) state.unlockedClues[2] = true;
    if (state.guesses.length >= 5) state.unlockedClues[3] = true;

    if (company.id === state.target.id) {
      state.status = "won";
      state.unlockedClues = { 1: true, 2: true, 3: true };
      recordGameStats(true, state.guesses.length);
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.status = "lost";
      state.unlockedClues = { 1: true, 2: true, 3: true };
      recordGameStats(false, MAX_GUESSES);
    }

    if (state.mode === "daily") {
      saveDailyProgress();
    }

    renderToolbarAndHints();
    renderGrid();
    renderCandidatesPanel();
    renderResultBanner();
  }

  function giveUpRound() {
    if (state.status !== "playing") return;
    state.status = "lost";
    state.unlockedClues = { 1: true, 2: true, 3: true };
    recordGameStats(false, MAX_GUESSES);
    if (state.mode === "daily") {
      saveDailyProgress();
    }
    renderToolbarAndHints();
    renderCandidatesPanel();
    renderResultBanner();
  }

  function updateAutocomplete() {
    if (state.status !== "playing") {
      hideAutocomplete();
      return;
    }

    const q = el.searchInput.value.trim().toLowerCase();
    const qClean = q.replace(/\s+equity$/i, "").trim();
    const smartOnly = el.chkSmartFilter.checked && state.guesses.length > 0;
    const ded = computeDeductions();
    const candidateIds = new Set(ded.candidates.map((c) => c.id));
    const guessedIds = new Set(state.guesses.map((g) => g.id));

    let list = COMPANIES.filter((c) => !guessedIds.has(c.id));
    if (smartOnly && qClean.length === 0) {
      list = list.filter((c) => candidateIds.has(c.id));
    }

    if (qClean.length > 0) {
      // When user explicitly types a ticker/name, search all unguessed companies (or prioritize candidates)
      const baseList = smartOnly ? list.filter((c) => candidateIds.has(c.id)) : list;
      const sourceList = baseList.length > 0 ? baseList : list;

      list = sourceList
        .map((c) => {
          const nameL = c.name.toLowerCase();
          const tickerL = (c.ticker || "").toLowerCase();
          const bbgL = getBbg(c).toLowerCase();
          const bbgRootL = bbgL.split(" ")[0];
          const aliasMatch = (c.aliases || []).some((a) => a.toLowerCase().includes(qClean));

          let score = 0;
          if (bbgL === qClean || bbgRootL === qClean || tickerL === qClean || nameL === qClean) {
            score = 100;
          } else if (bbgL.startsWith(qClean) || tickerL.startsWith(qClean)) {
            score = 92;
          } else if (nameL.startsWith(qClean)) {
            score = 85;
          } else if (aliasMatch) {
            score = 75;
          } else if (nameL.includes(qClean) || bbgL.includes(qClean)) {
            score = 60;
          }

          if (score > 0 && candidateIds.has(c.id)) {
            score += 4;
          }
          return { company: c, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.company.rank - b.company.rank)
        .map((item) => item.company);
    } else {
      const poolIds = new Set(getActivePool().map((c) => c.id));
      list = list.filter((c) => poolIds.has(c.id)).slice(0, 22);
    }

    state.acFiltered = list.slice(0, 22);
    state.acHighlightIdx = 0;

    if (state.acFiltered.length === 0) {
      el.acDropdown.innerHTML = `
        <div class="ac-row" style="justify-content:center;color:var(--text-muted);">
          Ingen treff
        </div>`;
      el.acDropdown.classList.remove("hidden");
      return;
    }

    el.acDropdown.innerHTML = state.acFiltered
      .map((c, idx) => {
        const isCand = candidateIds.has(c.id);
        return `
        <div class="ac-row ${idx === state.acHighlightIdx ? "active" : ""}" data-idx="${idx}" role="option">
          <div class="ac-left">
            <span class="bbg-pill">${getBbg(c)}</span>
            <span class="ac-name">${c.name}</span>
            ${state.guesses.length > 0 && isCand ? '<span class="ac-dot-fit" title="Passer ledetråder"></span>' : ""}
          </div>
          <div class="ac-right">
            <span>${SHORT_SECTOR[c.sector] || c.sector}</span>
            <span>${fmtCompactNOK(c.mcapBNOK)}</span>
            <span>#${c.rank}</span>
          </div>
        </div>`;
      })
      .join("");

    el.acDropdown.classList.remove("hidden");

    el.acDropdown.querySelectorAll(".ac-row[data-idx]").forEach((row) => {
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(row.getAttribute("data-idx"));
        if (state.acFiltered[idx]) {
          submitGuess(state.acFiltered[idx]);
        }
      });
    });
  }

  function hideAutocomplete() {
    el.acDropdown.classList.add("hidden");
  }

  function saveDailyProgress() {
    const payload = {
      dateKey: state.dailyDateKey,
      targetId: state.target.id,
      guessIds: state.guesses.map((g) => g.id),
      unlockedClues: state.unlockedClues,
      status: state.status
    };
    try {
      localStorage.setItem("folketrygdle_daily_2026", JSON.stringify(payload));
    } catch (e) {}
  }

  function loadDailyProgress(dateKey, targetCompany) {
    try {
      const raw = localStorage.getItem("folketrygdle_daily_2026");
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (saved.dateKey !== dateKey || saved.targetId !== targetCompany.id) return false;

      state.guesses = (saved.guessIds || [])
        .map((id) => COMPANIES.find((c) => c.id === id))
        .filter(Boolean);
      state.unlockedClues = saved.unlockedClues || { 1: false, 2: false, 3: false };
      state.status = saved.status || "playing";
      return true;
    } catch (e) {
      return false;
    }
  }

  function getStats() {
    try {
      const raw = localStorage.getItem("folketrygdle_stats_2026");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      played: 0,
      won: 0,
      currentStreak: 0,
      maxStreak: 0,
      dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    };
  }

  function recordGameStats(won, numGuesses) {
    const s = getStats();
    s.played += 1;
    if (won) {
      s.won += 1;
      s.currentStreak += 1;
      s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
      const bucket = Math.min(6, Math.max(1, numGuesses));
      s.dist[bucket] = (s.dist[bucket] || 0) + 1;
    } else {
      s.currentStreak = 0;
    }
    try {
      localStorage.setItem("folketrygdle_stats_2026", JSON.stringify(s));
    } catch (e) {}
  }

  function renderStatsModal() {
    const s = getStats();
    const winPct = s.played > 0 ? Math.round((s.won / s.played) * 100) : 0;

    el.statsKpiGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-val">${s.played}</div>
        <div class="stat-lbl">Spilt</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${winPct}%</div>
        <div class="stat-lbl">Seier</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${s.currentStreak}</div>
        <div class="stat-lbl">Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${s.maxStreak}</div>
        <div class="stat-lbl">Maks</div>
      </div>
    `;

    const maxBucket = Math.max(1, ...Object.values(s.dist));
    el.statsDistribution.innerHTML = [1, 2, 3, 4, 5, 6]
      .map((n) => {
        const count = s.dist[n] || 0;
        const widthPct = Math.max(6, Math.round((count / maxBucket) * 100));
        return `
        <div class="dist-item">
          <span>${n}</span>
          <div class="dist-track">
            <div class="dist-fill" style="width:${widthPct}%">${count}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  function initExplorerModal() {
    el.explorerSector.innerHTML =
      `<option value="ALL">Alle sektorer</option>` +
      ALL_SECTORS.map((s) => `<option value="${s}">${s}</option>`).join("");

    const updateTable = () => {
      const q = el.explorerSearch.value.trim().toLowerCase();
      const country = el.explorerCountry.value;
      const sector = el.explorerSector.value;
      const fund = el.explorerFund.value;
      const sort = el.explorerSort.value;

      let filtered = COMPANIES.filter((c) => {
        if (country !== "ALL" && c.country !== country) return false;
        if (sector !== "ALL" && c.sector !== sector) return false;
        if (fund !== "ALL" && !c.fund.includes(fund)) return false;
        if (q) {
          const matchName = c.name.toLowerCase().includes(q);
          const matchBbg = getBbg(c).toLowerCase().includes(q);
          const matchTicker = c.ticker.toLowerCase().includes(q);
          const matchAlias = (c.aliases || []).some((a) => a.toLowerCase().includes(q));
          if (!matchName && !matchBbg && !matchTicker && !matchAlias) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        if (sort === "mcap") return b.mcapBNOK - a.mcapBNOK;
        if (sort === "own") return b.ownershipPct - a.ownershipPct;
        if (sort === "price") return b.sharePriceNOK - a.sharePriceNOK;
        if (sort === "name") return a.name.localeCompare(b.name, "nb");
        return a.rank - b.rank;
      });

      const totalFtfBNOK = filtered.reduce((acc, c) => acc + c.marketValueMNOK, 0) / 1000;
      el.explorerSummaryStrip.textContent = `${filtered.length} selskaper · FTF: ${totalFtfBNOK.toFixed(1)}B NOK`;

      el.explorerTbody.innerHTML = filtered
        .map(
          (c) => `
          <tr>
            <td class="cell-mono">#${c.rank}</td>
            <td><strong>${c.name}</strong></td>
            <td><span class="bbg-pill">${getBbg(c)}</span></td>
            <td>${getIso(c)}</td>
            <td>${SHORT_SECTOR[c.sector] || c.sector}</td>
            <td class="cell-mono">${fmtCompactNOK(c.mcapBNOK)}</td>
            <td class="cell-mono">${fmtCompactFTF(c.marketValueMNOK)}</td>
            <td class="cell-mono">${c.ownershipPct.toFixed(2)}%</td>
            <td class="cell-mono">${c.fund}</td>
          </tr>`
        )
        .join("");
    };

    el.explorerSearch.addEventListener("input", updateTable);
    el.explorerCountry.addEventListener("change", updateTable);
    el.explorerSector.addEventListener("change", updateTable);
    el.explorerFund.addEventListener("change", updateTable);
    el.explorerSort.addEventListener("change", updateTable);

    updateTable();
  }

  function setMode(newMode) {
    state.mode = newMode;
    document.querySelectorAll(".seg-btn").forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-mode") === newMode);
    });
    startNewRound();
  }

  function startNewRound() {
    const dailyInfo = getDailyPuzzleInfo();
    state.dailyNumber = dailyInfo.dailyNumber;
    state.dailyDateKey = dailyInfo.dateKey;

    state.guesses = [];
    state.unlockedClues = { 1: false, 2: false, 3: false };
    state.status = "playing";

    if (state.mode === "daily") {
      state.target = dailyInfo.company;
      loadDailyProgress(dailyInfo.dateKey, dailyInfo.company);
    } else {
      const pool = getActivePool(state.mode);
      let available = pool.filter((c) => !state.playedIds.has(c.id));
      if (available.length === 0) {
        state.playedIds.clear();
        available = pool;
      }
      const picked = available[Math.floor(Math.random() * available.length)];
      state.target = picked;
      state.playedIds.add(picked.id);
    }

    renderToolbarAndHints();
    renderGrid();
    renderCandidatesPanel();
    renderResultBanner();
  }

  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.add("hidden");
    }, 2200);
  }

  function bindEvents() {
    document.querySelectorAll(".seg-btn").forEach((tab) => {
      tab.addEventListener("click", () => {
        setMode(tab.getAttribute("data-mode"));
      });
    });

    el.btnNewRound.addEventListener("click", () => {
      if (state.mode === "daily") {
        setMode("practice-major");
      } else {
        startNewRound();
      }
    });

    [1, 2, 3].forEach((num) => {
      const btn = document.getElementById(`btn-clue-${num}`);
      btn.addEventListener("click", () => {
        state.unlockedClues[num] = !state.unlockedClues[num];
        if (state.mode === "daily") saveDailyProgress();
        renderToolbarAndHints();
      });
    });

    el.btnToggleCandidates.addEventListener("click", () => {
      state.candidatesOpen = !state.candidatesOpen;
      el.candidatesDrawer.classList.toggle("hidden", !state.candidatesOpen);
      renderCandidatesPanel();
    });

    el.candidateSortSelect.addEventListener("change", renderCandidatesPanel);

    el.searchInput.addEventListener("focus", updateAutocomplete);
    el.searchInput.addEventListener("input", updateAutocomplete);
    el.chkSmartFilter.addEventListener("change", () => {
      updateAutocomplete();
      el.searchInput.focus();
    });

    el.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.acFiltered.length > 0) {
          state.acHighlightIdx = (state.acHighlightIdx + 1) % state.acFiltered.length;
          highlightAcRow();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.acFiltered.length > 0) {
          state.acHighlightIdx =
            (state.acHighlightIdx - 1 + state.acFiltered.length) % state.acFiltered.length;
          highlightAcRow();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (state.acFiltered.length > 0) {
          submitGuess(state.acFiltered[state.acHighlightIdx] || state.acFiltered[0]);
        }
      } else if (e.key === "Escape") {
        hideAutocomplete();
      }
    });

    el.btnSubmitGuess.addEventListener("click", () => {
      if (state.acFiltered.length > 0) {
        submitGuess(state.acFiltered[state.acHighlightIdx] || state.acFiltered[0]);
      } else {
        updateAutocomplete();
        if (state.acFiltered.length > 0) {
          submitGuess(state.acFiltered[0]);
        }
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) {
        hideAutocomplete();
      }
    });

    el.btnGiveUp.addEventListener("click", giveUpRound);

    el.btnExplorer.addEventListener("click", () => {
      el.modalExplorer.classList.remove("hidden");
    });
    el.btnStats.addEventListener("click", () => {
      renderStatsModal();
      el.modalStats.classList.remove("hidden");
    });
    el.btnHelp.addEventListener("click", () => {
      el.modalHelp.classList.remove("hidden");
    });

    document.querySelectorAll(".close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetModal = document.getElementById(btn.getAttribute("data-close"));
        if (targetModal) targetModal.classList.add("hidden");
      });
    });

    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
      });
    });

    el.btnResetStats.addEventListener("click", () => {
      localStorage.removeItem("folketrygdle_stats_2026");
      renderStatsModal();
      showToast("Nullstilt");
    });
  }

  function highlightAcRow() {
    const items = el.acDropdown.querySelectorAll(".ac-row[data-idx]");
    items.forEach((item, idx) => {
      if (idx === state.acHighlightIdx) {
        item.classList.add("active");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("active");
      }
    });
  }

  function init() {
    bindEvents();
    initExplorerModal();
    startNewRound();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
