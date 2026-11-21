(function () {
  "use strict";

  const COMPANIES = window.PORTFOLIO_COMPANIES || [];
  const MAX_GUESSES = 6;

  const FLAGS = {
    Norge: "🇳🇴",
    Sverige: "🇸🇪",
    Danmark: "🇩🇰",
    Finland: "🇫🇮",
    Island: "🇮🇸"
  };

  // Approximate capital coordinates (lat, lon) for compass direction feedback
  const COUNTRY_COORDS = {
    Norge: { lat: 59.91, lon: 10.75 },
    Sverige: { lat: 59.33, lon: 18.06 },
    Danmark: { lat: 55.68, lon: 12.57 },
    Finland: { lat: 60.17, lon: 24.94 },
    Island: { lat: 64.15, lon: -21.94 }
  };

  const SECTOR_ICONS = {
    Energi: "⚡",
    Finans: "🏦",
    Industri: "⚙️",
    Materialer: "🧱",
    Konsumvarer: "🐟",
    "Varige konsumvarer": "🛍️",
    Teknologi: "💻",
    Helse: "🧬",
    Telekommunikasjon: "📡",
    Forsyning: "🔋",
    Eiendom: "🏢"
  };

  // Related ICB sector clusters for Yellow ("Nær bransje") feedback
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

  const ALL_SECTORS = Object.keys(SECTOR_ICONS);

  // Quick-start popular companies
  const QUICK_STARTERS = [
    "Equinor",
    "DNB Bank",
    "Kongsberg Gruppen",
    "Orkla",
    "Storebrand",
    "Novo Nordisk",
    "Volvo"
  ];

  // State
  let state = {
    mode: "daily", // 'daily' | 'practice-major' | 'practice-norway' | 'practice-all'
    target: null,
    guesses: [], // array of company objects
    unlockedClues: { 1: false, 2: false, 3: false },
    status: "playing", // 'playing' | 'won' | 'lost'
    dailyNumber: 1,
    dailyDateKey: "",
    candidatesOpen: false,
    acHighlightIdx: 0,
    acFiltered: [],
    playedIds: new Set()
  };

  // DOM References
  const el = {
    attemptText: document.getElementById("attempt-text"),
    dailyNumberBadge: document.getElementById("daily-number-badge"),
    dossierEyebrow: document.getElementById("dossier-eyebrow"),
    dossierHeading: document.getElementById("dossier-heading"),
    dossierMeterFill: document.getElementById("dossier-meter-fill"),
    dossierTierBadge: document.getElementById("dossier-tier-badge"),
    btnClue1: document.getElementById("btn-clue-1"),
    btnClue2: document.getElementById("btn-clue-2"),
    btnClue3: document.getElementById("btn-clue-3"),
    clueStatus1: document.getElementById("clue-status-1"),
    clueStatus2: document.getElementById("clue-status-2"),
    clueStatus3: document.getElementById("clue-status-3"),
    clueDisplayBox: document.getElementById("clue-display-box"),
    clueItems: document.getElementById("clue-items"),
    radarFlags: document.getElementById("radar-flags"),
    radarMcapRange: document.getElementById("radar-mcap-range"),
    radarFtfRange: document.getElementById("radar-ftf-range"),
    radarOwnRange: document.getElementById("radar-own-range"),
    radarSectors: document.getElementById("radar-sectors"),
    btnToggleCandidates: document.getElementById("btn-toggle-candidates"),
    candidateCountText: document.getElementById("candidate-count-text"),
    candidateChevron: document.getElementById("candidate-chevron"),
    candidatesDrawer: document.getElementById("candidates-drawer"),
    candidatesChipsGrid: document.getElementById("candidates-chips-grid"),
    candidateSortSelect: document.getElementById("candidate-sort-select"),
    searchInput: document.getElementById("company-search-input"),
    chkSmartFilter: document.getElementById("chk-smart-filter"),
    btnSubmitGuess: document.getElementById("btn-submit-guess"),
    acDropdown: document.getElementById("autocomplete-dropdown"),
    quickStartBar: document.getElementById("quick-start-bar"),
    quickStartChips: document.getElementById("quick-start-chips"),
    resultBanner: document.getElementById("result-banner"),
    guessesList: document.getElementById("guesses-list"),
    emptySlotsList: document.getElementById("empty-slots-list"),
    btnNewRound: document.getElementById("btn-new-round"),
    btnGiveUp: document.getElementById("btn-give-up"),
    btnExplorer: document.getElementById("btn-explorer"),
    btnStats: document.getElementById("btn-stats"),
    btnHelp: document.getElementById("btn-help"),
    btnTheme: document.getElementById("btn-theme"),
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

  // Formatting utilities
  function fmtNum(n, decimals = 1) {
    return Number(n).toLocaleString("nb-NO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function fmtMcap(bnok) {
    if (bnok >= 100) return `${fmtNum(bnok, 0)} mrd. kr`;
    if (bnok >= 10) return `${fmtNum(bnok, 1)} mrd. kr`;
    return `${fmtNum(bnok, 2)} mrd. kr`;
  }

  function fmtFtfHolding(mnok) {
    if (mnok >= 1000) {
      return `${fmtNum(mnok / 1000, 2)} mrd. kr`;
    }
    return `${fmtNum(mnok, 0)} MNOK`;
  }

  function fmtFundLabel(fund) {
    if (fund === "SFT+SPN" || fund === "SPN+SFT") return "SPN + SFT";
    return fund;
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

  // Compute compass direction from guessed country to target country
  function getCompassDirection(fromCountry, toCountry) {
    if (fromCountry === toCountry) return { arrow: "✓", label: "Blink!" };
    const c1 = COUNTRY_COORDS[fromCountry];
    const c2 = COUNTRY_COORDS[toCountry];
    if (!c1 || !c2) return { arrow: "↔️", label: "Annet land" };

    const dLat = c2.lat - c1.lat;
    const dLon = (c2.lon - c1.lon) * Math.cos(((c1.lat + c2.lat) * Math.PI) / 360);
    const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI; // 0 = North, 90 = East

    if (angle >= -22.5 && angle < 22.5) return { arrow: "⬆️", label: "Nord" };
    if (angle >= 22.5 && angle < 67.5) return { arrow: "↗️", label: "Nordøst" };
    if (angle >= 67.5 && angle < 112.5) return { arrow: "➡️", label: "Øst" };
    if (angle >= 112.5 && angle < 157.5) return { arrow: "↘️", label: "Sørøst" };
    if (angle >= 157.5 || angle < -157.5) return { arrow: "⬇️", label: "Sør" };
    if (angle >= -157.5 && angle < -112.5) return { arrow: "↙️", label: "Sørvest" };
    if (angle >= -112.5 && angle < -67.5) return { arrow: "⬅️", label: "Vest" };
    return { arrow: "↖️", label: "Nordvest" };
  }

  // Evaluate a guess against the secret target across the 6 metrics
  function evaluateGuess(guess, target) {
    const isWin = guess.id === target.id;

    // 1. Country
    const countryExact = guess.country === target.country;
    const compass = getCompassDirection(guess.country, target.country);
    const countryEval = {
      state: countryExact ? "exact" : "wrong",
      flag: FLAGS[guess.country] || "🏳️",
      name: guess.country,
      sub: countryExact ? "Riktig land!" : `${compass.arrow} ${compass.label} mot målet`,
      emoji: countryExact ? "🟩" : "⬛"
    };

    // 2. ICB Sector
    const sectorExact = guess.sector === target.sector;
    const sameCluster = SECTOR_CLUSTERS[guess.sector] === SECTOR_CLUSTERS[target.sector];
    const sectorState = sectorExact ? "exact" : sameCluster ? "close" : "wrong";
    const sectorEval = {
      state: sectorState,
      icon: SECTOR_ICONS[guess.sector] || "🏢",
      name: guess.sector,
      sub: sectorExact ? "Riktig bransje!" : sameCluster ? "Nær bransje!" : "Annen bransje",
      emoji: sectorExact ? "🟩" : sameCluster ? "🟨" : "⬛"
    };

    // 3. Market Cap (mcapBNOK)
    const mcapRatio = Math.max(guess.mcapBNOK, target.mcapBNOK) / Math.max(Math.min(guess.mcapBNOK, target.mcapBNOK), 0.05);
    const mcapDiffPct = Math.abs(guess.mcapBNOK - target.mcapBNOK) / Math.max(target.mcapBNOK, 0.1);
    const mcapState = isWin || mcapDiffPct <= 0.15 ? "exact" : mcapRatio <= 2.2 ? "close" : "wrong";
    const mcapHigher = target.mcapBNOK > guess.mcapBNOK;
    let mcapArrow = "🎯";
    let mcapSub = "Blink!";
    if (!isWin && guess.mcapBNOK !== target.mcapBNOK) {
      if (mcapState === "exact") {
        mcapArrow = mcapHigher ? "⬆️" : "⬇️";
        mcapSub = mcapHigher ? "Nesten! Litt høyere" : "Nesten! Litt lavere";
      } else if (mcapState === "close") {
        mcapArrow = mcapHigher ? "⬆️" : "⬇️";
        mcapSub = mcapHigher ? "Målet er større" : "Målet er mindre";
      } else {
        mcapArrow = mcapHigher ? "⬆️⬆️" : "⬇️⬇️";
        mcapSub = mcapHigher ? "Mye større" : "Mye mindre";
      }
    }
    const mcapEval = {
      state: mcapState,
      val: fmtMcap(guess.mcapBNOK),
      arrow: mcapArrow,
      sub: mcapSub,
      emoji: mcapState === "exact" ? "🟩" : mcapHigher ? "⬆️" : "⬇️"
    };

    // 4. FTF Holding Value & Rank
    const ftfRatio = Math.max(guess.marketValueMNOK, target.marketValueMNOK) / Math.max(Math.min(guess.marketValueMNOK, target.marketValueMNOK), 0.05);
    const rankDiff = Math.abs(guess.rank - target.rank);
    const ftfState = isWin || ftfRatio <= 1.18 || rankDiff <= 5 ? "exact" : ftfRatio <= 2.3 || rankDiff <= 25 ? "close" : "wrong";
    const ftfHigher = target.marketValueMNOK > guess.marketValueMNOK; // target has larger FTF position (closer to #1)
    let ftfArrow = "🎯";
    let ftfSub = `Rang #${guess.rank} (Blink!)`;
    if (!isWin && guess.rank !== target.rank) {
      if (ftfState === "exact") {
        ftfArrow = ftfHigher ? "⬆️" : "⬇️";
        ftfSub = `Rang #${guess.rank} (${ftfHigher ? "Litt større" : "Litt mindre"})`;
      } else if (ftfState === "close") {
        ftfArrow = ftfHigher ? "⬆️" : "⬇️";
        ftfSub = `Rang #${guess.rank} (${ftfHigher ? "Større post" : "Mindre post"})`;
      } else {
        ftfArrow = ftfHigher ? "⬆️⬆️" : "⬇️⬇️";
        ftfSub = `Rang #${guess.rank} (${ftfHigher ? "Mye større" : "Mye mindre"})`;
      }
    }
    const ftfEval = {
      state: ftfState,
      val: fmtFtfHolding(guess.marketValueMNOK),
      arrow: ftfArrow,
      sub: ftfSub,
      emoji: ftfState === "exact" ? "🟩" : ftfHigher ? "⬆️" : "⬇️"
    };

    // 5. FTF Ownership %
    const ownAbsDiff = Math.abs(guess.ownershipPct - target.ownershipPct);
    const ownRelDiff = ownAbsDiff / Math.max(target.ownershipPct, 0.05);
    const ownState = isWin || ownAbsDiff <= 0.5 || ownRelDiff <= 0.15 ? "exact" : ownAbsDiff <= 2.2 || ownRelDiff <= 0.55 ? "close" : "wrong";
    const ownHigher = target.ownershipPct > guess.ownershipPct;
    let ownArrow = "🎯";
    let ownSub = "Blink!";
    if (!isWin && guess.ownershipPct !== target.ownershipPct) {
      if (ownState === "exact") {
        ownArrow = ownHigher ? "⬆️" : "⬇️";
        ownSub = ownHigher ? "Nesten! Litt høyere" : "Nesten! Litt lavere";
      } else if (ownState === "close") {
        ownArrow = ownHigher ? "⬆️" : "⬇️";
        ownSub = ownHigher ? "Høyere eierandel" : "Lavere eierandel";
      } else {
        ownArrow = ownHigher ? "⬆️⬆️" : "⬇️⬇️";
        ownSub = ownHigher ? "Mye høyere %" : "Mye lavere %";
      }
    }
    const ownEval = {
      state: ownState,
      val: `${fmtNum(guess.ownershipPct, 2)} %`,
      arrow: ownArrow,
      sub: ownSub,
      emoji: ownState === "exact" ? "🟩" : ownHigher ? "⬆️" : "⬇️"
    };

    // 6. Fund (SPN vs SFT)
    const fundExact = guess.fund === target.fund;
    const gHasSPN = guess.fund.includes("SPN");
    const gHasSFT = guess.fund.includes("SFT");
    const tHasSPN = target.fund.includes("SPN");
    const tHasSFT = target.fund.includes("SFT");
    const fundOverlap = (gHasSPN && tHasSPN) || (gHasSFT && tHasSFT);
    const fundState = fundExact ? "exact" : fundOverlap ? "close" : "wrong";
    const fundEval = {
      state: fundState,
      val: fmtFundLabel(guess.fund),
      sub: fundExact ? "Riktig fond!" : fundOverlap ? "Delvis match" : "Annet fond",
      emoji: fundExact ? "🟩" : fundOverlap ? "🟨" : "⬛"
    };

    return {
      isWin,
      country: countryEval,
      sector: sectorEval,
      mcap: mcapEval,
      ftf: ftfEval,
      own: ownEval,
      fund: fundEval
    };
  }

  // Compute deductions & matching candidate companies based on all guesses so far
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

    let minFtf = 0;
    let maxFtf = Infinity;
    let minRank = 1;
    let maxRank = COMPANIES.length;

    let minOwn = 0;
    let maxOwn = 100;

    let confirmedFund = null;
    const eliminatedFunds = new Set();

    for (const g of state.guesses) {
      if (g.id === t.id) {
        confirmedCountry = t.country;
        confirmedSector = t.sector;
        confirmedFund = t.fund;
        minMcap = maxMcap = t.mcapBNOK;
        minFtf = maxFtf = t.marketValueMNOK;
        minRank = maxRank = t.rank;
        minOwn = maxOwn = t.ownershipPct;
        break;
      }

      // Country deduction
      if (g.country === t.country) {
        confirmedCountry = t.country;
      } else {
        eliminatedCountries.add(g.country);
      }

      // Sector deduction
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

      // Market Cap bounds
      if (t.mcapBNOK > g.mcapBNOK) {
        minMcap = Math.max(minMcap, g.mcapBNOK);
      } else if (t.mcapBNOK < g.mcapBNOK) {
        maxMcap = Math.min(maxMcap, g.mcapBNOK);
      }

      // FTF Holding & Rank bounds
      if (t.marketValueMNOK > g.marketValueMNOK) {
        minFtf = Math.max(minFtf, g.marketValueMNOK);
        maxRank = Math.min(maxRank, g.rank - 1);
      } else if (t.marketValueMNOK < g.marketValueMNOK) {
        maxFtf = Math.min(maxFtf, g.marketValueMNOK);
        minRank = Math.max(minRank, g.rank + 1);
      }

      // Ownership % bounds
      if (t.ownershipPct > g.ownershipPct) {
        minOwn = Math.max(minOwn, g.ownershipPct);
      } else if (t.ownershipPct < g.ownershipPct) {
        maxOwn = Math.min(maxOwn, g.ownershipPct);
      }

      // Fund deduction
      if (g.fund === t.fund) {
        confirmedFund = t.fund;
      } else {
        eliminatedFunds.add(g.fund);
      }
    }

    if (confirmedCountry) {
      for (const c of Object.keys(FLAGS)) {
        if (c !== confirmedCountry) eliminatedCountries.add(c);
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

    // Filter candidate companies from active pool (or all companies)
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
      if (confirmedFund && c.fund !== confirmedFund) return false;
      if (eliminatedFunds.has(c.fund)) return false;
      return true;
    });

    return {
      confirmedCountry,
      eliminatedCountries,
      confirmedSector,
      relatedCluster,
      eliminatedSectors,
      minMcap,
      maxMcap,
      minFtf,
      maxFtf,
      minRank,
      maxRank,
      minOwn,
      maxOwn,
      candidates
    };
  }

  // Daily puzzle seed based on local date YYYY-MM-DD
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

    // Deterministic hash from dateKey
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

  // Mask company name inside clue text so it doesn't spoil the exact answer
  function maskCompanyName(clueText, company) {
    let masked = clueText;
    const parts = [company.name, ...company.aliases].filter((x) => x && x.length >= 3);
    for (const p of parts) {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      masked = masked.replace(regex, "███");
    }
    return masked;
  }

  // Render Dossier & Progressive Clues
  function renderDossier() {
    const t = state.target;
    if (!t) return;

    if (state.mode === "daily") {
      el.dossierEyebrow.textContent = `DAGENS SELSKAP #${state.dailyNumber} (${state.dailyDateKey}) • FOLKETRYGDFONDET 2026`;
    } else if (state.mode === "practice-major") {
      el.dossierEyebrow.textContent = "FRISPILL: KJENTE SELSKAPER (TOPP-PORTEFØLJEN 2026)";
    } else if (state.mode === "practice-norway") {
      el.dossierEyebrow.textContent = "FRISPILL: KUN NORSKE SELSKAPER (OSLO BØRS 2026)";
    } else {
      el.dossierEyebrow.textContent = "FRISPILL: HELE NORDEN (SPN & STATENS FOND I TROMSØ 2026)";
    }

    // Visual size tier gauge (logarithmic scale of FTF holding from 1 MNOK to 30,000 MNOK)
    const logVal = Math.log10(Math.max(1, t.marketValueMNOK));
    const pct = Math.min(100, Math.max(12, Math.round((logVal / Math.log10(30000)) * 100)));
    el.dossierMeterFill.style.width = `${pct}%`;

    let tierText = "Small-Cap Post";
    if (t.rank <= 15) tierText = "Kjernepost (Topp 15)";
    else if (t.rank <= 50) tierText = "Storpost (Topp 50)";
    else if (t.rank <= 120) tierText = "Mellomstor post (Topp 120)";
    else tierText = "Nisjepost (#121–334)";
    el.dossierTierBadge.textContent = tierText;

    // Clues
    const updateClueBtn = (num, btn, statusEl) => {
      if (state.unlockedClues[num]) {
        btn.classList.add("unlocked");
        statusEl.textContent = "Åpnet ✓";
      } else {
        btn.classList.remove("unlocked");
        statusEl.textContent = "Vis gratis";
      }
    };
    updateClueBtn(1, el.btnClue1, el.clueStatus1);
    updateClueBtn(2, el.btnClue2, el.clueStatus2);
    updateClueBtn(3, el.btnClue3, el.clueStatus3);

    const activeLines = [];
    if (state.unlockedClues[1]) {
      activeLines.push({
        tag: "💡 Virksomhet",
        text: maskCompanyName(t.clue, t)
      });
    }
    if (state.unlockedClues[2]) {
      const sharesStr =
        t.shares >= 1e6
          ? `${fmtNum(t.shares / 1e6, 2)} mill. aksjer`
          : `${t.shares.toLocaleString("nb-NO")} aksjer`;
      activeLines.push({
        tag: "📊 Nøkkeltall & By",
        text: `Hovedkontor: ${t.hq} • Implied aksjekurs (2026): ca. ${fmtNum(t.sharePriceNOK, 2)} NOK • Folketrygdfondet eier ${sharesStr}.`
      });
    }
    if (state.unlockedClues[3]) {
      const cleanName = t.name.trim();
      const firstLetter = cleanName.charAt(0).toUpperCase();
      const lastLetter = cleanName.charAt(cleanName.length - 1).toUpperCase();
      const maskedTicker =
        t.ticker.length > 2
          ? `${t.ticker[0]} ${"_ ".repeat(t.ticker.length - 2)}${t.ticker[t.ticker.length - 1]}`
          : `${t.ticker[0]} _`;
      activeLines.push({
        tag: "🔤 Navn & Ticker",
        text: `Selskapsnavnet starter på «${firstLetter}» og slutter på «${lastLetter}» (${cleanName.length} tegn) • Børsticker: ${maskedTicker}`
      });
    }

    if (activeLines.length === 0) {
      el.clueDisplayBox.classList.add("hidden");
      el.clueItems.innerHTML = "";
    } else {
      el.clueDisplayBox.classList.remove("hidden");
      el.clueItems.innerHTML = activeLines
        .map(
          (line) => `
          <div class="clue-line">
            <span class="clue-line-tag">${line.tag}</span>
            <span>${line.text}</span>
          </div>`
        )
        .join("");
    }
  }

  // Render Live Deduction Radar & Matching Candidates
  function renderRadar() {
    const ded = computeDeductions();

    // Update countries
    const flagChips = el.radarFlags.querySelectorAll(".flag-chip");
    flagChips.forEach((chip) => {
      const c = chip.getAttribute("data-country");
      chip.classList.remove("confirmed", "eliminated");
      if (ded.confirmedCountry === c) {
        chip.classList.add("confirmed");
      } else if (ded.eliminatedCountries.has(c)) {
        chip.classList.add("eliminated");
      }
    });

    // Update bounds
    if (ded.minMcap > 0 && ded.maxMcap < Infinity) {
      el.radarMcapRange.textContent =
        ded.minMcap === ded.maxMcap
          ? fmtMcap(ded.minMcap)
          : `${fmtNum(ded.minMcap, 1)} – ${fmtNum(ded.maxMcap, 1)} mrd.`;
    } else if (ded.minMcap > 0) {
      el.radarMcapRange.textContent = `> ${fmtMcap(ded.minMcap)}`;
    } else if (ded.maxMcap < Infinity) {
      el.radarMcapRange.textContent = `< ${fmtMcap(ded.maxMcap)}`;
    } else {
      el.radarMcapRange.textContent = "Alle størrelser";
    }

    // FTF Rank / Value range
    if (ded.minRank === ded.maxRank) {
      el.radarFtfRange.textContent = `Rang #${ded.minRank}`;
    } else {
      el.radarFtfRange.textContent = `Rang #${ded.minRank} – #${ded.maxRank}`;
    }

    // Ownership % range
    if (ded.minOwn > 0 && ded.maxOwn < 100) {
      el.radarOwnRange.textContent =
        ded.minOwn === ded.maxOwn
          ? `${fmtNum(ded.minOwn, 2)} %`
          : `${fmtNum(ded.minOwn, 2)} % – ${fmtNum(ded.maxOwn, 2)} %`;
    } else if (ded.minOwn > 0) {
      el.radarOwnRange.textContent = `> ${fmtNum(ded.minOwn, 2)} %`;
    } else if (ded.maxOwn < 100) {
      el.radarOwnRange.textContent = `< ${fmtNum(ded.maxOwn, 2)} %`;
    } else {
      el.radarOwnRange.textContent = "0,01 % – 15,0 %";
    }

    // Sector pills
    el.radarSectors.innerHTML = ALL_SECTORS.map((sec) => {
      let cls = "sector-chip";
      if (ded.confirmedSector === sec) cls += " confirmed";
      else if (ded.eliminatedSectors.has(sec)) cls += " eliminated";
      else if (ded.relatedCluster && SECTOR_CLUSTERS[sec] === ded.relatedCluster) cls += " related";
      return `<span class="${cls}">${SECTOR_ICONS[sec]} ${sec}</span>`;
    }).join("");

    // Candidate count badge
    const count = ded.candidates.length;
    el.candidateCountText.textContent =
      count === 1 ? "🎯 1 mulig selskap gjenstår!" : `🎯 ${count} mulige selskaper`;
    el.candidateChevron.textContent = state.candidatesOpen ? "▲ Skjul liste" : "▼ Vis kandidater";

    // Sort candidates for drawer
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
        <button class="candidate-pick-btn" data-id="${c.id}" title="Klikk for å gjette ${c.name}">
          <div class="cand-left">
            <span class="cand-name">${FLAGS[c.country] || ""} ${c.name}</span>
            <span class="cand-sub">${SECTOR_ICONS[c.sector] || ""} ${c.sector} • #${c.rank}</span>
          </div>
          <div class="cand-right">
            <div>${fmtMcap(c.mcapBNOK)}</div>
            <div>Eier: ${fmtNum(c.ownershipPct, 2)}%</div>
          </div>
        </button>`
      )
      .join("");

    el.candidatesChipsGrid.querySelectorAll(".candidate-pick-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const comp = COMPANIES.find((x) => x.id === btn.getAttribute("data-id"));
        if (comp) submitGuess(comp);
      });
    });
  }

  // Render Guesses Board
  function renderBoard() {
    el.attemptText.textContent = `${state.guesses.length} / ${MAX_GUESSES}`;

    // Show quick-start bar only before first guess
    if (state.guesses.length === 0 && state.status === "playing") {
      el.quickStartBar.classList.remove("hidden");
    } else {
      el.quickStartBar.classList.add("hidden");
    }

    el.guessesList.innerHTML = state.guesses
      .map((g) => {
        const ev = evaluateGuess(g, state.target);
        return `
        <div class="guess-row">
          <div class="guess-tile tile-company ${ev.isWin ? "state-exact" : ""}">
            <div class="tile-main-val">
              <span>${FLAGS[g.country] || ""}</span>
              <span>${g.name}</span>
            </div>
            <div class="tile-sub-val">${g.ticker} • ${g.hq}</div>
          </div>

          <div class="guess-tile state-${ev.country.state}" style="animation-delay: 40ms">
            <div class="tile-main-val">
              <span>${ev.country.flag}</span>
              <span>${ev.country.name}</span>
            </div>
            <div class="tile-sub-val">${ev.country.sub}</div>
          </div>

          <div class="guess-tile state-${ev.sector.state}" style="animation-delay: 90ms">
            <div class="tile-main-val">
              <span>${ev.sector.icon}</span>
              <span>${ev.sector.name}</span>
            </div>
            <div class="tile-sub-val">${ev.sector.sub}</div>
          </div>

          <div class="guess-tile state-${ev.mcap.state}" style="animation-delay: 140ms">
            <div class="tile-main-val tile-mono">
              <span>${ev.mcap.val}</span>
              <span class="tile-arrow-badge">${ev.mcap.arrow}</span>
            </div>
            <div class="tile-sub-val">${ev.mcap.sub}</div>
          </div>

          <div class="guess-tile state-${ev.ftf.state}" style="animation-delay: 190ms">
            <div class="tile-main-val tile-mono">
              <span>${ev.ftf.val}</span>
              <span class="tile-arrow-badge">${ev.ftf.arrow}</span>
            </div>
            <div class="tile-sub-val">${ev.ftf.sub}</div>
          </div>

          <div class="guess-tile state-${ev.own.state}" style="animation-delay: 240ms">
            <div class="tile-main-val tile-mono">
              <span>${ev.own.val}</span>
              <span class="tile-arrow-badge">${ev.own.arrow}</span>
            </div>
            <div class="tile-sub-val">${ev.own.sub}</div>
          </div>

          <div class="guess-tile state-${ev.fund.state}" style="animation-delay: 290ms">
            <div class="tile-main-val tile-mono">${ev.fund.val}</div>
            <div class="tile-sub-val">${ev.fund.sub}</div>
          </div>
        </div>`;
      })
      .join("");

    // Remaining empty slots
    const remaining = Math.max(0, MAX_GUESSES - state.guesses.length);
    const emptyRows = [];
    for (let i = 0; i < remaining; i++) {
      const guessNum = state.guesses.length + i + 1;
      emptyRows.push(`
        <div class="empty-slot-row">
          <div class="empty-slot-tile">Forsøk ${guessNum} av ${MAX_GUESSES}</div>
          <div class="empty-slot-tile">Land</div>
          <div class="empty-slot-tile">Sektor</div>
          <div class="empty-slot-tile">Børsverdi</div>
          <div class="empty-slot-tile">FTF-Post</div>
          <div class="empty-slot-tile">Eierandel</div>
          <div class="empty-slot-tile">Fond</div>
        </div>`);
    }
    el.emptySlotsList.innerHTML = emptyRows.join("");
  }

  // Render Victory / Game Over Banner
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

    const sharesStr =
      t.shares >= 1e6
        ? `${fmtNum(t.shares / 1e6, 2)} mill. aksjer`
        : `${t.shares.toLocaleString("nb-NO")} aksjer`;

    el.resultBanner.innerHTML = `
      <div class="result-top-row">
        <div>
          <div class="dossier-eyebrow">${isWon ? "🎉 BLINK! PORTEFØLJESELSKAPET ER FUNNET" : "📊 RUNDEN ER OVER — HER ER FASITEN"}</div>
          <h3 class="result-headline">
            ${FLAGS[t.country] || ""} ${t.name} <span style="font-weight:500;opacity:0.8">(${t.ticker})</span>
          </h3>
          <p style="font-size:0.86rem;color:var(--text-secondary);margin-top:2px;">
            ${isWon ? `Imponerende! Du fant selskapet på <strong>${state.guesses.length} av ${MAX_GUESSES}</strong> forsøk.` : `Det hemmelige selskapet i Folketrygdfondets 2026-portefølje var <strong>${t.name}</strong>.`}
          </p>
        </div>
        <div class="result-actions">
          <button id="btn-share-result" class="btn-primary" style="padding:10px 18px;">
            📋 Del resultat
          </button>
          <button id="btn-play-again-banner" class="btn-secondary" style="padding:10px 18px;">
            🎲 Spill ny runde
          </button>
        </div>
      </div>

      <div class="result-company-card">
        <p style="font-size:0.9rem;line-height:1.5;">${t.clue}</p>
        <div class="result-metrics-grid">
          <div class="result-metric-box">
            <div class="result-metric-label">Rangering i FTF</div>
            <div class="result-metric-val">#${t.rank} av 334</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">FTF Beholdning (2026)</div>
            <div class="result-metric-val">${fmtFtfHolding(t.marketValueMNOK)}</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">FTF Eierandel</div>
            <div class="result-metric-val">${fmtNum(t.ownershipPct, 2)} %</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">Selskapets Børsverdi</div>
            <div class="result-metric-val">${fmtMcap(t.mcapBNOK)}</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">Aksjekurs (2026)</div>
            <div class="result-metric-val">${fmtNum(t.sharePriceNOK, 2)} NOK</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">Antall FTF-Aksjer</div>
            <div class="result-metric-val">${sharesStr}</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">ICB-Sektor</div>
            <div class="result-metric-val">${SECTOR_ICONS[t.sector] || ""} ${t.sector}</div>
          </div>
          <div class="result-metric-box">
            <div class="result-metric-label">Hovedkontor &amp; Fond</div>
            <div class="result-metric-val">${t.hq} (${fmtFundLabel(t.fund)})</div>
          </div>
        </div>
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

  // Copy Wordle/Tradle-style emoji grid to clipboard
  function copyShareResult() {
    const modeTitle =
      state.mode === "daily"
        ? `FOLKETRYGDLE 2026 #${state.dailyNumber}`
        : `FOLKETRYGDLE 2026 (Frispill)`;
    const score = state.status === "won" ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;

    const rows = state.guesses.map((g) => {
      const ev = evaluateGuess(g, state.target);
      return `${ev.country.emoji}${ev.sector.emoji}${ev.mcap.emoji}${ev.ftf.emoji}${ev.own.emoji}${ev.fund.emoji}`;
    });

    const text = `🏛️ ${modeTitle} • ${score}\n${rows.join("\n")}\nhttps://egil10.github.io/compquiz/`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("Resultat kopiert til utklippstavlen! 📋");
      });
    } else {
      showToast("Kopiert! 📋");
    }
  }

  // Submit a company guess
  function submitGuess(company) {
    if (!company || state.status !== "playing") return;
    if (state.guesses.some((g) => g.id === company.id)) {
      showToast(`Du har allerede gjettet ${company.name}!`);
      return;
    }

    state.guesses.push(company);
    el.searchInput.value = "";
    hideAutocomplete();

    // Auto-unlock progressive hints as guesses progress so the player never feels stuck
    if (state.guesses.length >= 2) state.unlockedClues[1] = true;
    if (state.guesses.length >= 4) state.unlockedClues[2] = true;
    if (state.guesses.length >= 5) state.unlockedClues[3] = true;

    if (company.id === state.target.id) {
      state.status = "won";
      state.unlockedClues = { 1: true, 2: true, 3: true };
      recordGameStats(true, state.guesses.length);
      launchConfetti();
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.status = "lost";
      state.unlockedClues = { 1: true, 2: true, 3: true };
      recordGameStats(false, MAX_GUESSES);
    }

    if (state.mode === "daily") {
      saveDailyProgress();
    }

    renderDossier();
    renderBoard();
    renderRadar();
    renderResultBanner();
  }

  // Give up current round and reveal answer
  function giveUpRound() {
    if (state.status !== "playing") return;
    state.status = "lost";
    state.unlockedClues = { 1: true, 2: true, 3: true };
    recordGameStats(false, MAX_GUESSES);
    if (state.mode === "daily") {
      saveDailyProgress();
    }
    renderDossier();
    renderRadar();
    renderResultBanner();
  }

  // Autocomplete search logic
  function updateAutocomplete() {
    if (state.status !== "playing") {
      hideAutocomplete();
      return;
    }

    const q = el.searchInput.value.trim().toLowerCase();
    const smartOnly = el.chkSmartFilter.checked && state.guesses.length > 0;
    const ded = computeDeductions();
    const candidateIds = new Set(ded.candidates.map((c) => c.id));
    const guessedIds = new Set(state.guesses.map((g) => g.id));

    let list = COMPANIES.filter((c) => !guessedIds.has(c.id));
    if (smartOnly) {
      list = list.filter((c) => candidateIds.has(c.id));
    }

    if (q.length > 0) {
      list = list
        .map((c) => {
          const nameL = c.name.toLowerCase();
          const tickerL = c.ticker.toLowerCase();
          const aliasMatch = (c.aliases || []).some((a) => a.toLowerCase().includes(q));
          const sectorMatch = c.sector.toLowerCase().includes(q);
          const countryMatch = c.country.toLowerCase().includes(q);
          const hqMatch = (c.hq || "").toLowerCase().includes(q);

          let score = 0;
          if (nameL === q || tickerL === q) score = 100;
          else if (nameL.startsWith(q) || tickerL.startsWith(q)) score = 85;
          else if (aliasMatch) score = 75;
          else if (nameL.includes(q)) score = 60;
          else if (hqMatch || sectorMatch || countryMatch) score = 35;

          return { company: c, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.company.rank - b.company.rank)
        .map((item) => item.company);
    } else {
      // When empty query, show top matching candidates from active pool
      const poolIds = new Set(getActivePool().map((c) => c.id));
      list = list.filter((c) => poolIds.has(c.id)).slice(0, 25);
    }

    state.acFiltered = list.slice(0, 30);
    state.acHighlightIdx = 0;

    if (state.acFiltered.length === 0) {
      el.acDropdown.innerHTML = `
        <div class="ac-item" style="justify-content:center;color:var(--text-secondary);">
          Ingen selskaper funnet. Prøv å skru av «Kun mulige treff» eller søk bredere.
        </div>`;
      el.acDropdown.classList.remove("hidden");
      return;
    }

    el.acDropdown.innerHTML = state.acFiltered
      .map((c, idx) => {
        const isCand = candidateIds.has(c.id);
        const aliasHint =
          c.aliases && c.aliases.length > 0 ? ` • tidl./kjent som ${c.aliases.slice(0, 2).join(", ")}` : "";
        return `
        <div class="ac-item ${idx === state.acHighlightIdx ? "active" : ""}" data-idx="${idx}" role="option">
          <div class="ac-main">
            <span class="ac-flag">${FLAGS[c.country] || "🏳️"}</span>
            <div class="ac-name-group">
              <div class="ac-title-line">
                <span class="ac-name">${c.name}</span>
                <span class="ac-ticker">${c.ticker}</span>
                ${state.guesses.length > 0 && isCand ? '<span class="ac-match-pill">✓ Passer ledetråder</span>' : ""}
              </div>
              <div class="ac-sub">${SECTOR_ICONS[c.sector] || ""} ${c.sector} • ${c.hq}${aliasHint}</div>
            </div>
          </div>
          <div class="ac-metrics">
            <span class="ac-metric-pill" title="Børsverdi">MCap: ${fmtMcap(c.mcapBNOK)}</span>
            <span class="ac-metric-pill" title="Rangering i FTF">#${c.rank} (${fmtNum(c.ownershipPct, 1)}%)</span>
          </div>
        </div>`;
      })
      .join("");

    el.acDropdown.classList.remove("hidden");

    el.acDropdown.querySelectorAll(".ac-item[data-idx]").forEach((row) => {
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

  // Quick-Start Starter Chips
  function renderQuickStarters() {
    const pool = getActivePool();
    const starters = QUICK_STARTERS.map((name) => COMPANIES.find((c) => c.name === name)).filter(Boolean);

    el.quickStartChips.innerHTML =
      starters
        .map(
          (c) => `
        <button class="quick-chip" data-id="${c.id}">
          <span>${FLAGS[c.country] || ""}</span>
          <span>${c.name}</span>
        </button>`
        )
        .join("") +
      `<button class="quick-chip" id="btn-random-opener" style="border-color:var(--accent-sky);color:var(--accent-sky);">
        🎲 Tilfeldig åpning
      </button>`;

    el.quickStartChips.querySelectorAll(".quick-chip[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const comp = COMPANIES.find((c) => c.id === btn.getAttribute("data-id"));
        if (comp) submitGuess(comp);
      });
    });

    const randBtn = document.getElementById("btn-random-opener");
    if (randBtn) {
      randBtn.addEventListener("click", () => {
        const randComp = pool[Math.floor(Math.random() * Math.min(35, pool.length))];
        if (randComp) submitGuess(randComp);
      });
    }
  }

  // Save & Load Daily Progress
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

  // Player Statistics in localStorage
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
      <div class="stat-kpi-box">
        <div class="stat-kpi-num">${s.played}</div>
        <div class="stat-kpi-label">Spilte runder</div>
      </div>
      <div class="stat-kpi-box">
        <div class="stat-kpi-num">${winPct}%</div>
        <div class="stat-kpi-label">Seiersprosent</div>
      </div>
      <div class="stat-kpi-box">
        <div class="stat-kpi-num">🔥 ${s.currentStreak}</div>
        <div class="stat-kpi-label">Nåværende streak</div>
      </div>
      <div class="stat-kpi-box">
        <div class="stat-kpi-num">🏆 ${s.maxStreak}</div>
        <div class="stat-kpi-label">Beste streak</div>
      </div>
    `;

    const maxBucket = Math.max(1, ...Object.values(s.dist));
    el.statsDistribution.innerHTML = [1, 2, 3, 4, 5, 6]
      .map((n) => {
        const count = s.dist[n] || 0;
        const widthPct = Math.max(8, Math.round((count / maxBucket) * 100));
        return `
        <div class="dist-row">
          <span>#${n}</span>
          <div class="dist-bar-wrap">
            <div class="dist-bar" style="width:${widthPct}%">${count}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  // Portfolio Explorer Modal (All 334 companies)
  function initExplorerModal() {
    el.explorerSector.innerHTML =
      `<option value="ALL">Alle ICB-sektorer (11)</option>` +
      ALL_SECTORS.map((s) => `<option value="${s}">${SECTOR_ICONS[s]} ${s}</option>`).join("");

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
          const matchTicker = c.ticker.toLowerCase().includes(q);
          const matchHq = (c.hq || "").toLowerCase().includes(q);
          const matchAlias = (c.aliases || []).some((a) => a.toLowerCase().includes(q));
          if (!matchName && !matchTicker && !matchHq && !matchAlias) return false;
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

      const totalFtfMNOK = filtered.reduce((acc, c) => acc + c.marketValueMNOK, 0);
      const avgOwn =
        filtered.length > 0
          ? filtered.reduce((acc, c) => acc + c.ownershipPct, 0) / filtered.length
          : 0;

      el.explorerSummaryStrip.innerHTML = `
        <span>Viser <strong>${filtered.length}</strong> av 334 selskaper</span>
        <span>•</span>
        <span>Samlet FTF-verdi i utvalg: <strong>${fmtNum(totalFtfMNOK / 1000, 2)} mrd. NOK</strong></span>
        <span>•</span>
        <span>Snitt FTF-eierandel: <strong>${fmtNum(avgOwn, 2)} %</strong></span>
      `;

      el.explorerTbody.innerHTML = filtered
        .map(
          (c) => `
          <tr>
            <td class="tile-mono">#${c.rank}</td>
            <td>
              <strong>${c.name}</strong>
              <span class="ac-ticker" style="margin-left:5px;">${c.ticker}</span>
              <div style="font-size:0.72rem;color:var(--text-secondary);">${c.hq}</div>
            </td>
            <td>${FLAGS[c.country] || ""} ${c.country}</td>
            <td>${SECTOR_ICONS[c.sector] || ""} ${c.sector}</td>
            <td class="tile-mono">${fmtMcap(c.mcapBNOK)}</td>
            <td class="tile-mono">${fmtFtfHolding(c.marketValueMNOK)}</td>
            <td class="tile-mono">${fmtNum(c.ownershipPct, 2)} %</td>
            <td class="tile-mono">${fmtNum(c.sharePriceNOK, 2)} kr</td>
            <td class="tile-mono">${fmtFundLabel(c.fund)}</td>
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

  // Mode Switching & New Round Initialization
  function setMode(newMode) {
    state.mode = newMode;
    document.querySelectorAll(".mode-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-mode") === newMode);
    });
    startNewRound();
  }

  function startNewRound() {
    const dailyInfo = getDailyPuzzleInfo();
    state.dailyNumber = dailyInfo.dailyNumber;
    state.dailyDateKey = dailyInfo.dateKey;
    el.dailyNumberBadge.textContent = `#${state.dailyNumber}`;

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

    renderQuickStarters();
    renderDossier();
    renderBoard();
    renderRadar();
    renderResultBanner();
  }

  // Confetti celebration
  function launchConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#34d399", "#10b981", "#77B8F2", "#fbbf24", "#f43f5e", "#a7f3d0"];
    const pieces = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2.5 + Math.random() * 4.5,
      vx: (Math.random() - 0.5) * 3,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.14
    }));

    let frame = 0;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 165) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(tick);
  }

  // Toast helper
  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.add("hidden");
    }, 2800);
  }

  // Event Listeners Setup
  function bindEvents() {
    // Mode tabs
    document.querySelectorAll(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        setMode(tab.getAttribute("data-mode"));
      });
    });

    // New round button
    el.btnNewRound.addEventListener("click", () => {
      if (state.mode === "daily") {
        setMode("practice-major");
        showToast("Byttet til Frispill for nytt selskap! 🎲");
      } else {
        startNewRound();
        showToast("Nytt selskap trukket! 🎯");
      }
    });

    // Free Clues toggle
    [1, 2, 3].forEach((num) => {
      const btn = document.getElementById(`btn-clue-${num}`);
      btn.addEventListener("click", () => {
        state.unlockedClues[num] = !state.unlockedClues[num];
        if (state.mode === "daily") saveDailyProgress();
        renderDossier();
      });
    });

    // Candidates drawer toggle
    el.btnToggleCandidates.addEventListener("click", () => {
      state.candidatesOpen = !state.candidatesOpen;
      el.candidatesDrawer.classList.toggle("hidden", !state.candidatesOpen);
      renderRadar();
    });

    el.candidateSortSelect.addEventListener("change", renderRadar);

    // Search input & keyboard navigation
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
      if (!e.target.closest(".search-bar-wrapper")) {
        hideAutocomplete();
      }
    });

    // Give up button
    el.btnGiveUp.addEventListener("click", giveUpRound);

    // Modals
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

    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetModal = document.getElementById(btn.getAttribute("data-close"));
        if (targetModal) targetModal.classList.add("hidden");
      });
    });

    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.classList.add("hidden");
      });
    });

    el.btnResetStats.addEventListener("click", () => {
      localStorage.removeItem("folketrygdle_stats_2026");
      renderStatsModal();
      showToast("Statistikk nullstilt!");
    });

    // Theme toggle
    el.btnTheme.addEventListener("click", () => {
      const html = document.documentElement;
      const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
      html.setAttribute("data-theme", next);
      try {
        localStorage.setItem("folketrygdle_theme", next);
      } catch (e) {}
    });
  }

  function highlightAcRow() {
    const items = el.acDropdown.querySelectorAll(".ac-item[data-idx]");
    items.forEach((item, idx) => {
      if (idx === state.acHighlightIdx) {
        item.classList.add("active");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("active");
      }
    });
  }

  // Boot
  function init() {
    try {
      const savedTheme = localStorage.getItem("folketrygdle_theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
    } catch (e) {}

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
