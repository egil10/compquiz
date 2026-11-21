#!/usr/bin/env python3
"""Pull live key figures from Yahoo Finance and write multiples.js.

Usage:
    pip install yfinance
    python3 scripts/update_multiples.py

For each playable company (isMajorPool in portfolio_data.js) this fetches
market cap, share price, trailing P/E and EV/EBITDA. Figures reported in a
different currency than the listing (e.g. Equinor reports in USD) are converted
before computing the ratios, so P/E and EV/EBITDA are currency-consistent.
"""
import datetime as dt
import json
import pathlib
import re
import sys
import time

import yfinance as yf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUFFIX = {"NO": ".OL", "SS": ".ST", "DC": ".CO", "FH": ".HE", "IR": ".IC"}

# Bloomberg root -> Yahoo root, where the share class needs a dash or the name differs.
YAHOO_OVERRIDE = {
    "NOVOB DC": "NOVO-B.CO", "ATCOA SS": "ATCO-A.ST", "INVEB SS": "INVE-B.ST",
    "EPIA SS": "EPI-A.ST", "SWEDA SS": "SWED-A.ST", "ASSAB SS": "ASSA-B.ST",
    "VOLVB SS": "VOLV-B.ST", "NSISB DC": "NSIS-B.CO", "HLUNB DC": "HLUN-B.CO",
    "ERICB SS": "ERIC-B.ST", "SEBA SS": "SEB-A.ST", "AMBUB DC": "AMBU-B.CO",
    "COLOB DC": "COLO-B.CO", "SHBA SS": "SHB-A.ST", "CARLB DC": "CARL-B.CO",
    "MAERSKB DC": "MAERSK-B.CO", "SAABB SS": "SAAB-B.ST", "SKISB SS": "SKIS-B.ST",
    "ELUXB SS": "ELUX-B.ST", "NDA FH": "NDA-FI.HE", "EURN NO": "CMBTO.OL",
    "ELOPK NO": "ELO.OL",
}

PE_MAX = 250  # above this the ratio is noise; treat as not meaningful
EV_EBITDA_MAX = 150


def load_companies():
    src = (ROOT / "portfolio_data.js").read_text(encoding="utf-8")
    arr = src[src.index("window.PORTFOLIO_COMPANIES = ") + len("window.PORTFOLIO_COMPANIES = "):]
    return json.loads(arr.strip().rstrip(";"))


def yahoo_symbol(bbg):
    if bbg in YAHOO_OVERRIDE:
        return YAHOO_OVERRIDE[bbg]
    root, exch = bbg.split(" ")
    return root + SUFFIX[exch]


_fx_cache = {}


def fx(src, dst):
    """Rate converting 1 unit of src into dst."""
    if not src or not dst or src == dst:
        return 1.0
    key = (src, dst)
    if key not in _fx_cache:
        hist = yf.Ticker(f"{src}{dst}=X").history(period="5d")
        _fx_cache[key] = float(hist["Close"].dropna().iloc[-1])
    return _fx_cache[key]


def num(v):
    return v if isinstance(v, (int, float)) and v == v else None


def fetch(symbol):
    for attempt in range(4):
        try:
            return yf.Ticker(symbol).info
        except Exception as e:  # rate limits etc.
            wait = 5 * (attempt + 1)
            print(f"  {symbol}: {e!r}, retry in {wait}s", file=sys.stderr)
            time.sleep(wait)
    return {}


def figures(info):
    cur = info.get("currency")
    fin = info.get("financialCurrency") or cur
    mcap = num(info.get("marketCap"))
    ev = num(info.get("enterpriseValue"))
    ni = num(info.get("netIncomeToCommon"))
    ebitda = num(info.get("ebitda"))
    price = num(info.get("regularMarketPrice")) or num(info.get("currentPrice"))
    if not mcap or not cur:
        return None

    f = fx(fin, cur)
    if cur == fin and num(info.get("trailingPE")):
        pe = info["trailingPE"]
    elif ni:
        pe = mcap / (ni * f)
    else:
        pe = None
    if pe is not None and not (0 < pe <= PE_MAX):
        pe = None

    ev_ebitda = ev / (ebitda * f) if ev and ebitda else None
    if ev_ebitda is not None and not (0 < ev_ebitda <= EV_EBITDA_MAX):
        ev_ebitda = None

    to_nok = fx(cur, "NOK")
    return {
        "pe": round(pe, 1) if pe else None,
        "evEbitda": round(ev_ebitda, 1) if ev_ebitda else None,
        "mcapBNOK": round(mcap * to_nok / 1e9, 2),
        "priceNOK": round(price * to_nok, 2) if price else None,
        "yahoo": info.get("symbol"),
    }


def main():
    companies = [c for c in load_companies() if c.get("isMajorPool")]
    out, missing = {}, []
    for i, c in enumerate(companies, 1):
        sym = yahoo_symbol(c["bbgTicker"])
        data = figures(fetch(sym))
        if data and c["sector"] == "Finans":
            # EV/EBITDA is not meaningful for banks, insurers and investment companies.
            data["evEbitda"] = None
        if data:
            out[c["bbgTicker"]] = data
            print(f"[{i:3}/{len(companies)}] {sym:12} P/E {data['pe']}  EV/EBITDA {data['evEbitda']}  MCap {data['mcapBNOK']}B")
        else:
            missing.append(f"{c['name']} ({sym})")
            print(f"[{i:3}/{len(companies)}] {sym:12} NO DATA", file=sys.stderr)
        time.sleep(0.4)

    today = dt.date.today().isoformat()
    body = ",\n".join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in out.items())
    js = (
        "// Generert av scripts/update_multiples.py – ikke rediger for hånd.\n"
        "// Kilde: Yahoo Finance. P/E = trailing 12 mnd. EV/EBITDA = enterprise value / EBITDA (TTM).\n"
        "// null = ikke meningsfullt (negativt resultat, eller EBITDA ikke rapportert, f.eks. banker).\n"
        f'window.MULTIPLES_META = {{ source: "Yahoo Finance", date: "{today}" }};\n'
        f"window.PORTFOLIO_MULTIPLES = {{\n{body}\n}};\n"
    )
    (ROOT / "multiples.js").write_text(js, encoding="utf-8")
    print(f"\nWrote {len(out)} companies to multiples.js ({today}).")
    if missing:
        print("Missing:", ", ".join(missing))


if __name__ == "__main__":
    main()
