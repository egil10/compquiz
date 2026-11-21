#!/usr/bin/env python3
"""Rebuild all game data from primary sources.

    pip install yfinance pillow
    python3 scripts/update_data.py [--refresh-logos]

1. Holdings: every company in Folketrygdfondet's equity portfolio (SPN + SFT),
   parsed from folketrygdfondet.no. Companies held by both funds are merged.
2. Market data per company from Yahoo Finance (yfinance): market cap, price,
   trailing P/E, EV/EBITDA, dividend yield, 52-week return. Figures reported in
   another currency than the listing are FX-adjusted before computing ratios.
3. Founding year from Wikidata (P571), matched by exchange ticker, then by name.
4. Logo (site icon via Google's favicon service), saved to logos/<id>.png.
5. Year-to-date weekly price series for the sparkline hint.

Writes portfolio_data.js and market_data.js. Hand-written fields in
portfolio_data.js (hq, aliases, clue, tickers, daily pool) are preserved.
"""
import collections
import concurrent.futures
import datetime as dt
import json
import pathlib
import re
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request

import yfinance as yf

ROOT = pathlib.Path(__file__).resolve().parent.parent
FTF_URL = "https://www.folketrygdfondet.no/nb/folketrygdfondet/portefoljeoversikt/selskaper"
UA = {"User-Agent": "TrygdleDataBot/1.0 (https://github.com/egil10/compquiz)"}

SUFFIX = {"Norge": ".OL", "Sverige": ".ST", "Danmark": ".CO", "Finland": ".HE", "Island": ".IC"}
BBG_EXCH = {"Norge": "NO", "Sverige": "SS", "Danmark": "DC", "Finland": "FH", "Island": "IR"}
ISO = {"Norge": "NO", "Sverige": "SE", "Danmark": "DK", "Finland": "FI", "Island": "IS"}
COUNTRY_QID = {"Norge": "Q20", "Sverige": "Q34", "Danmark": "Q35", "Finland": "Q33", "Island": "Q189"}
NORDIC_EXCHANGES = ["Q909158", "Q581755", "Q1019983", "Q1019992", "Q107190302", "Q4346290", "Q1674303"]

# Yahoo symbols that can't be derived from the Bloomberg ticker.
YAHOO_OVERRIDE = {
    "NDA FH": "NDA-FI.HE", "EURN NO": "CMBTO.OL", "ELOPK NO": "ELO.OL",
    "STEND SS": "STEF-B.ST", "JOHN SS": "JOMA.ST", "INVES SS": "ORES.ST", "AKTIE SS": "FAG.ST",
    "OMA FH": "OMASP.HE", "MT DC": "MTHH.CO", "HAMPI IR": "HAMP.IC", "REITI IR": "REITIR.IC",
    "HEIMA IR": "HEIMAR.IC",
}
# Wrong/renamed Bloomberg tickers in the source data.
BBG_FIX = {
    "EURN NO": "CMBTO NO", "STEND SS": "STEFB SS", "JOHN SS": "JOMA SS", "INVES SS": "ORES SS",
    "AKTIE SS": "FAG SS", "OMA FH": "OMASP FH", "MT DC": "MTHH DC",
}
for _old, _new in BBG_FIX.items():
    YAHOO_OVERRIDE.setdefault(_new, YAHOO_OVERRIDE.get(_old))
# Hand-checked values (founding years, websites for logos) live in scripts/overrides.json.
OVERRIDES = json.loads((ROOT / "scripts" / "overrides.json").read_text(encoding="utf-8"))
FOUNDED_OVERRIDE = {k: v["year"] for k, v in OVERRIDES.get("founded", {}).items()}
WEBSITE_OVERRIDE = OVERRIDES.get("website", {})
DESC_OVERRIDE = OVERRIDES.get("desc", {})  # short hand-written descriptions (≤ 95 chars)
MANUAL_MARKET = OVERRIDES.get("manual_market", {})  # holdings Yahoo doesn't cover (unlisted etc.)
LOGO_URL = OVERRIDES.get("logo_url", {})  # direct image URLs from manual review
LOGO_BLOCKLIST = OVERRIDES.get("logo_blocklist", [])  # dHashes of generic favicons

PE_MAX = 600
EV_EBITDA_MAX = 150


def get(url, accept=None, tries=4):
    headers = dict(UA)
    if accept:
        headers["Accept"] = accept
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60).read()
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))


def norm(s):
    s = (s or "").lower().replace("ø", "o").replace("æ", "ae").replace("å", "a")
    s = s.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("é", "e")
    return re.sub(r"[^a-z0-9]", "", s)


# ---------------------------------------------------------------- holdings

def fetch_holdings():
    page = get(FTF_URL).decode("utf-8").replace('\\"', '"')
    rows = [json.loads(o) for o in re.findall(r'\{"type":"equities","issuerId":"[^{}]*\}', page)]
    if len(rows) < 100:
        sys.exit(f"Only parsed {len(rows)} holdings from {FTF_URL}; page format changed?")
    merged = collections.OrderedDict()
    for r in rows:
        m = merged.setdefault(r["issuerId"], {
            "id": r["issuerId"], "name": r["name"].strip(), "country": r["country"],
            "sector": r["sector"], "funds": [], "marketValueMNOK": 0.0, "shares": 0,
            "ownershipPct": 0.0, "date": r["date"],
        })
        m["funds"].append(r["fund"])
        m["marketValueMNOK"] += r["marketValue"] or 0
        m["shares"] += r["equity"] or 0
        m["ownershipPct"] += (r["ownershipPercent"] or 0) * 100
    out = sorted(merged.values(), key=lambda c: -c["marketValueMNOK"])
    for i, c in enumerate(out, 1):
        c["rank"] = i
        c["fund"] = "+".join(sorted(set(c.pop("funds")), reverse=True))  # "SPN", "SFT", "SPN+SFT"
        c["marketValueMNOK"] = round(c["marketValueMNOK"], 2)
        c["ownershipPct"] = round(c["ownershipPct"], 2)
    return out, rows[0]["date"]


def load_previous():
    path = ROOT / "portfolio_data.js"
    if not path.exists():
        return {}
    src = path.read_text(encoding="utf-8")
    arr = src[src.index("window.PORTFOLIO_COMPANIES = ") + len("window.PORTFOLIO_COMPANIES = "):]
    prev = json.loads(arr.strip().rstrip(";"))
    return {norm(c["name"]): c for c in prev}


def load_previous_market():
    """Founding years rarely change; reuse them instead of hitting Wikidata again."""
    path = ROOT / "market_data.js"
    if not path.exists():
        return {}
    src = path.read_text(encoding="utf-8")
    return json.loads(src[src.index("window.MARKET_DATA = ") + len("window.MARKET_DATA = "):].strip().rstrip(";"))


# ---------------------------------------------------------------- yahoo

_fx = {}


_fx_lock = threading.Lock()


def _quote(pair):
    for i in range(3):
        try:
            closes = yf.Ticker(f"{pair}=X").history(period="1mo")["Close"].dropna()
            if len(closes):
                return float(closes.iloc[-1])
        except Exception:
            pass
        time.sleep(2 * (i + 1))
    return None


def fx(src, dst):
    if not src or not dst or src == dst:
        return 1.0
    with _fx_lock:
        if (src, dst) not in _fx:
            rate = _quote(src + dst)
            if rate is None:  # thin pairs like ISKNOK: cross via USD
                a, b = _quote(src + "USD") or (1 / (_quote("USD" + src) or float("nan"))), _quote("USD" + dst)
                rate = a * b if a and b and a == a else None
            if rate is None:
                raise RuntimeError(f"No FX rate for {src}{dst}")
            _fx[(src, dst)] = rate
        return _fx[(src, dst)]


def num(v):
    return v if isinstance(v, (int, float)) and v == v else None


def info_for(symbol):
    for i in range(3):
        try:
            info = yf.Ticker(symbol).info
            return info if num(info.get("marketCap")) and info.get("currency") else None
        except Exception as e:
            if "404" in str(e) or "Not Found" in str(e):
                return None
            time.sleep(4 * (i + 1))
    return None


def yahoo_candidates(c, known=None):
    bbg = c.get("bbgTicker")
    sfx = SUFFIX[c["country"]]
    if known:
        yield known
    if bbg in YAHOO_OVERRIDE:
        yield YAHOO_OVERRIDE[bbg]
    if bbg:
        root = bbg.split(" ")[0]
        yield root + sfx
        if len(root) > 3 and root[-1] in "ABC":
            yield f"{root[:-1]}-{root[-1]}{sfx}"
        if c["country"] == "Finland":
            yield root + "-FI" + sfx
    try:
        for q in yf.Search(c["name"], max_results=10).quotes:
            if q.get("symbol", "").endswith(sfx):
                yield q["symbol"]
    except Exception:
        pass


def resolve_yahoo(c, known=None):
    seen = set()
    for sym in yahoo_candidates(c, known):
        if sym in seen:
            continue
        seen.add(sym)
        info = info_for(sym)
        if info:
            return sym, info
    return None, None


def ttm_from_statements(symbol, rows):
    """Sum the last four quarters of an income-statement row (fallback when Yahoo's summary lacks it)."""
    try:
        q = yf.Ticker(symbol).quarterly_income_stmt
        for row in rows:
            if row in q.index:
                vals = q.loc[row].dropna().tolist()[:4]
                if len(vals) == 4:
                    return float(sum(vals))
        a = yf.Ticker(symbol).income_stmt
        for row in rows:
            if row in a.index:
                vals = a.loc[row].dropna().tolist()
                if vals:
                    return float(vals[0])
    except Exception:
        pass
    return None


def market_figures(info, sector, symbol=None):
    cur = info["currency"]
    fin = info.get("financialCurrency") or cur
    mcap = num(info.get("marketCap"))
    ev = num(info.get("enterpriseValue"))
    ni = num(info.get("netIncomeToCommon"))
    ebitda = num(info.get("ebitda"))
    price = num(info.get("regularMarketPrice")) or num(info.get("currentPrice"))
    f = fx(fin, cur)

    # P/E: Yahoo's trailing P/E when currencies match, else market cap / FX-adjusted net income.
    pe = num(info.get("trailingPE")) if cur == fin else None
    if pe is None and ni is None and symbol:
        ni = ttm_from_statements(symbol, ["Net Income Common Stockholders", "Net Income"])
    if pe is None and ni:
        pe = mcap / (ni * f)
    if pe is not None and not (0 < pe <= PE_MAX):
        pe = None

    # EV/EBITDA: fill a missing EV from debt and cash, a missing EBITDA from the statements.
    if ev is None and mcap:
        debt, cash = num(info.get("totalDebt")), num(info.get("totalCash"))
        if debt is not None or cash is not None:
            ev = mcap + ((debt or 0) - (cash or 0)) * f
    if ebitda is None and symbol and sector != "Finans":
        ebitda = ttm_from_statements(symbol, ["EBITDA", "Normalized EBITDA"])
    ev_ebitda = ev / (ebitda * f) if ev and ebitda else None
    if sector == "Finans" or (ev_ebitda is not None and not (0 < ev_ebitda <= EV_EBITDA_MAX)):
        ev_ebitda = None

    div = num(info.get("dividendYield")) or 0.0  # percent
    ret = num(info.get("52WeekChange"))
    to_nok = fx(cur, "NOK")
    return {
        "mcapBNOK": round(mcap * to_nok / 1e9, 2),
        "priceNOK": round(price * to_nok, 2) if price else None,
        "pe": round(pe, 1) if pe else None,
        "evEbitda": round(ev_ebitda, 1) if ev_ebitda else None,
        "div": round(div, 1) if div <= 25 else None,
        "ret1y": round(ret * 100) if ret is not None else None,
        # Why a multiple is missing: "neg" = negative earnings/EBITDA, "fin" = not meaningful for finance.
        "peNote": None if pe else ("neg" if (ni is not None and ni < 0) or (num(info.get("trailingEps")) or 0) < 0 else None),
        "evNote": None if ev_ebitda else ("fin" if sector == "Finans" else "neg" if ebitda is not None and ebitda < 0 else None),
    }


def ytd_series(symbol):
    """Weekly closes since Jan 1, as % change from the first close (for the sparkline hint)."""
    try:
        start = f"{dt.date.today().year}-01-01"
        closes = yf.Ticker(symbol).history(start=start, interval="1wk")["Close"].dropna().tolist()
    except Exception:
        return None
    if len(closes) < 4 or not closes[0]:
        return None
    return [round((v / closes[0] - 1) * 100, 1) for v in closes]


# ---------------------------------------------------------------- wikidata

def sparql(query):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query})
    return json.loads(get(url, "application/sparql-results+json"))["results"]["bindings"]


def wikidata_ticker_years():
    q = """SELECT ?ticker ?inception WHERE {
      ?item p:P414 ?st . ?st ps:P414 ?ex . ?st pq:P249 ?ticker . ?item wdt:P571 ?inception .
      VALUES ?ex { %s } }""" % " ".join("wd:" + x for x in NORDIC_EXCHANGES)
    years = {}
    for b in sparql(q):
        y = int(b["inception"]["value"][:5].lstrip("+")[:4]) if b["inception"]["value"][1:5].isdigit() else None
        if y:
            k = norm(b["ticker"]["value"])
            years[k] = min(years.get(k, 9999), y)
    return years


def wbapi(params):
    params = {**params, "format": "json"}
    return json.loads(get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params)))


def year_of(claims):
    ys = []
    for cl in claims.get("P571", []):
        t = cl.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("time", "")
        m = re.match(r"\+(\d{4})", t)
        if m:
            ys.append(int(m.group(1)))
    return min(ys) if ys else None


def wikidata_name_year(c):
    """Search Wikidata by name; prefer exact label matches and listed companies in the right country."""
    base = re.sub(r"\s*\(.*?\)", "", c["name"]).strip()
    names = dict.fromkeys([base, re.sub(r"\b(ASA|AB|A/S|Oyj|Plc|Holding|Holdings|Group|Gruppen)\b", "", base).strip()])
    hits = {}
    for n in names:
        for lang in ("en", "nb", "sv"):
            try:
                res = wbapi({"action": "wbsearchentities", "search": n, "language": lang, "type": "item", "limit": 7})
            except Exception:
                continue
            for h in res.get("search", []):
                hits.setdefault(h["id"], h.get("label", ""))
    if not hits:
        return None
    ids = list(hits)[:40]
    ents = {}
    for i in range(0, len(ids), 20):
        ents.update(wbapi({"action": "wbgetentities", "ids": "|".join(ids[i:i + 20]), "props": "claims"}).get("entities", {}))
    want = COUNTRY_QID[c["country"]]
    targets = {norm(n) for n in names}
    best = None
    for rank, qid in enumerate(ids):
        claims = ents.get(qid, {}).get("claims", {})
        countries = {cl["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for cl in claims.get("P17", [])}
        y = year_of(claims)
        if not y or want not in countries:
            continue
        score = (norm(hits[qid]) in targets) * 4 + ("P414" in claims) * 3 + ("P452" in claims or "P1128" in claims) - rank * 0.01
        if best is None or score > best[0]:
            best = (score, y)
    return best[1] if best and best[0] >= 1 else None


# ---------------------------------------------------------------- logos

def _png_size(data):
    return struct.unpack(">II", data[16:24]) if data[:8] == b"\x89PNG\r\n\x1a\n" else (0, 0)


def _to_png(data, target=256):
    """Normalise ico/png/jpg/webp bytes to a square-ish PNG (needs Pillow). None if unreadable."""
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        if getattr(img, "ico", None):
            img.size = max(img.ico.sizes())
        img = img.convert("RGBA")
        if img.width > img.height * 1.3 or img.height > img.width * 1.3:  # pad wordmarks to a square
            side = max(img.size)
            sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
            img = sq
        if img.width > target:
            img = img.resize((target, round(img.height * target / img.width)), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "PNG", optimize=True)
        return out.getvalue()
    except Exception:
        return None


def logo_hash(png):
    """64-bit difference hash, used to reject generic hosting/CMS favicons."""
    import io
    from PIL import Image
    g = Image.open(io.BytesIO(png)).convert("RGBA")
    bg = Image.new("RGBA", g.size, (255, 255, 255, 255))
    g = Image.alpha_composite(bg, g).convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    bits = "".join("1" if px[r * 9 + c] > px[r * 9 + c + 1] else "0" for r in range(8) for c in range(8))
    return f"{int(bits, 2):016x}"


def _is_generic(png):
    try:
        h = int(logo_hash(png), 16)
    except Exception:
        return True
    return any(bin(h ^ int(b, 16)).count("1") <= 6 for b in LOGO_BLOCKLIST)


def _homepage_icons(domain):
    """All icon candidates advertised by the homepage, plus the conventional paths."""
    html, base = "", f"https://{domain}/"
    for url in (f"https://{domain}", f"https://www.{domain}"):
        try:
            html, base = get(url, tries=1).decode("utf-8", "ignore"), url + "/"
            break
        except Exception:
            continue
    found = []
    for tag in re.findall(r"<link[^>]+>", html, re.I):
        rel = re.search(r'rel=["\']([^"\']+)', tag, re.I)
        href = re.search(r'href=["\']([^"\']+)', tag, re.I)
        if not rel or not href or "icon" not in rel.group(1).lower() or href.group(1).endswith(".svg"):
            continue
        size = re.search(r'sizes=["\'](\d+)', tag)
        prio = 2 if "apple" in rel.group(1).lower() else 1
        found.append((prio, int(size.group(1)) if size else 0, urllib.parse.urljoin(base, href.group(1))))
    for path in ("apple-touch-icon.png", "apple-touch-icon-precomposed.png"):
        found.append((2, 180, urllib.parse.urljoin(base, path)))
    return [u for *_, u in sorted(found, reverse=True)]


def site_url(website):
    """Normalise a website/domain to https://domain (no path) for the 'visit company' link."""
    if not website:
        return None
    domain = re.sub(r"^https?://", "", website.strip()).split("/")[0]
    return f"https://{domain}" if domain else None


def fetch_logo(cid, website, refresh):
    """Pick the best logo: manual URL > apple-touch-icon / declared icons > Google favicon.
    Generic favicons (Vercel, CMS defaults, ...) listed in overrides.json are rejected."""
    path = ROOT / "logos" / f"{cid.lower()}.png"
    if path.exists() and not refresh:
        return True
    urls = []
    if cid in LOGO_URL:
        urls.append(LOGO_URL[cid])
    website = WEBSITE_OVERRIDE.get(cid) or website
    if website:
        domain = re.sub(r"^https?://(www\.)?", "", website).split("/")[0]
        urls += _homepage_icons(domain)
        urls.append(f"https://www.google.com/s2/favicons?domain={domain}&sz=128")
    best = None
    for i, url in enumerate(urls):
        try:
            png = _to_png(get(url, tries=1))
        except Exception:
            continue
        if not png:
            continue
        w = _png_size(png)[0]
        if w < 32 or (i or cid not in LOGO_URL) and _is_generic(png):
            continue
        if cid in LOGO_URL and i == 0:
            best = png
            break
        if best is None or w > _png_size(best)[0] * 1.5:  # earlier = preferred source unless much smaller
            best = png
        if w >= 128:
            break
    if not best:
        return path.exists()  # keep a previously saved logo if every source fails now
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(best)
    return True


# ---------------------------------------------------------------- main

def generic_clue(c):
    adj = {"Norge": "Norsk", "Sverige": "Svensk", "Danmark": "Dansk", "Finland": "Finsk", "Island": "Islandsk"}
    return f"{adj[c['country']]} selskap innen {c['sector'].lower()}."


def main():
    refresh = "--refresh-logos" in sys.argv
    holdings, report_date = fetch_holdings()
    prev = load_previous()
    print(f"Holdings: {len(holdings)} companies ({report_date})")

    print("Wikidata ticker index…")
    try:
        tick_years = wikidata_ticker_years()
    except Exception as e:  # query service is often rate limited; name search still works
        print(f"  skipped ({e})")
        tick_years = {}
    prev_market = load_previous_market()

    def process(h):
        p = prev.get(norm(h["name"]), {})
        c = {
            "rank": h["rank"], "id": h["id"], "name": h["name"],
            "ticker": p.get("ticker", ""), "bbgTicker": p.get("bbgTicker", ""),
            "iso": ISO[h["country"]], "hq": p.get("hq", ""), "aliases": p.get("aliases", []),
            "country": h["country"], "sector": h["sector"], "fund": h["fund"],
            "marketValueMNOK": h["marketValueMNOK"], "ownershipPct": h["ownershipPct"],
            "shares": h["shares"], "isMajorPool": bool(p.get("isMajorPool")),
            "clue": DESC_OVERRIDE.get(h["id"]) or p.get("clue") or generic_clue(h),
        }
        if c["bbgTicker"] in BBG_FIX:
            c["ticker"] = BBG_FIX[c["bbgTicker"]].split(" ")[0]
            c["bbgTicker"] = BBG_FIX[c["bbgTicker"]]
        sym, info = resolve_yahoo(c, prev_market.get(c["id"], {}).get("yahoo"))
        line = f"{h['rank']:3} {h['name'][:28]:28} {sym or '-':14}"
        if not info:
            return no_yahoo(c, line)
        try:
            m = market_figures(info, c["sector"], sym)
        except Exception as e:
            return c, None, line + f" FAILED ({e})"
        m["yahoo"] = sym
        if not c["bbgTicker"]:
            root = sym.split(".")[0].replace("-", "")
            c["ticker"], c["bbgTicker"] = root, f"{root} {BBG_EXCH[c['country']]}"
        if not c["hq"]:
            c["hq"] = info.get("city", "")
        root_keys = {norm(sym.split(".")[0]), norm(c["bbgTicker"].split(" ")[0])}
        founded = (
            FOUNDED_OVERRIDE.get(c["id"])
            or (None if "--refresh-founded" in sys.argv else prev_market.get(c["id"], {}).get("founded"))
            or next((tick_years[k] for k in root_keys if k in tick_years), None)
        )
        if not founded:
            try:
                founded = wikidata_name_year(c)
            except Exception:
                founded = None
        m["founded"] = founded
        m["logo"] = fetch_logo(c["id"], info.get("website"), refresh)
        m["website"] = site_url(WEBSITE_OVERRIDE.get(c["id"]) or info.get("website"))
        m["ytd"] = ytd_series(sym)
        return c, m, line + f" P/E {m['pe']}  EV/EBITDA {m['evEbitda']}  est. {founded}  logo {m['logo']}"

    def no_yahoo(c, line):
        """No Yahoo data: reuse yesterday's figures if we had them (transient failure), else
        build a minimal entry from manual overrides and the value implied by FTF's stake."""
        old = prev_market.get(c["id"])
        if old and old.get("yahoo"):
            return c, {**old, "stale": True}, line + " (Yahoo failed, kept previous data)"
        man = MANUAL_MARKET.get(c["id"], {})
        implied = (
            round(c["marketValueMNOK"] / c["ownershipPct"] * 100 / 1000, 2)
            if c["ownershipPct"] > 0 and c["marketValueMNOK"] > 0 else None
        )
        m = {
            "mcapBNOK": man.get("mcapBNOK") or implied,
            "mcapImplied": not man.get("mcapBNOK") and implied is not None,
            "priceNOK": None, "pe": man.get("pe"), "evEbitda": man.get("evEbitda"),
            "div": man.get("div"), "ret1y": None, "peNote": None, "evNote": None,
            "yahoo": None, "founded": FOUNDED_OVERRIDE.get(c["id"]) or man.get("founded"),
            "logo": fetch_logo(c["id"], man.get("website"), refresh), "ytd": None,
            "status": man.get("status") or "unlisted",
            "website": site_url(WEBSITE_OVERRIDE.get(c["id"]) or man.get("website")),
        }
        if man.get("hq"):
            c["hq"] = man["hq"]
        if not m["mcapBNOK"]:
            return c, None, line + " NO MARKET DATA"
        return c, m, line + f" manual/implied mcap {m['mcapBNOK']}"

    companies, market = [], {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for n, (c, m, line) in enumerate(pool.map(process, holdings), 1):
            print(f"[{n:3}/{len(holdings)}] {line}", flush=True)
            companies.append(c)
            if m:
                market[c["id"]] = m

    today = dt.date.today().isoformat()
    total = round(sum(c["marketValueMNOK"] for c in companies), 2)
    (ROOT / "portfolio_data.js").write_text(
        "// Generert av scripts/update_data.py fra Folketrygdfondets porteføljeoversikt.\n"
        f"// Kilde: {FTF_URL}\n"
        f'window.PORTFOLIO_META = {{ reportDate: "{report_date}", totalCompanies: {len(companies)}, totalEquitiesMNOK: {total} }};\n\n'
        "window.PORTFOLIO_COMPANIES = " + json.dumps(companies, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in market.items())
    (ROOT / "market_data.js").write_text(
        "// Generert av scripts/update_data.py – ikke rediger for hånd.\n"
        "// Yahoo Finance: børsverdi, kurs, P/E (TTM), EV/EBITDA (TTM), utbytte %, 52-ukers avkastning %,\n"
        "// ytd = ukentlig kursutvikling i år (% fra første handelsuke).\n"
        "// Wikidata: stiftelsesår (founded). Logoer: Google favicon-tjeneste. null = ikke meningsfullt / mangler.\n"
        f'window.MARKET_META = {{ source: "Yahoo Finance", date: "{today}" }};\n'
        f"window.MARKET_DATA = {{\n{body}\n}};\n",
        encoding="utf-8",
    )
    missing = [c["name"] for c in companies if c["id"] not in market]
    no_year = [c["name"] for c in companies if c["id"] in market and not market[c["id"]]["founded"]]
    print(f"\n{len(companies)} companies, {len(market)} with market data, "
          f"{len(market) - len(no_year)} with founding year, {sum(m['logo'] for m in market.values())} logos.")
    if missing:
        print("No market data:", ", ".join(missing))
    if no_year:
        print("No founding year:", ", ".join(no_year))


if __name__ == "__main__":
    main()
