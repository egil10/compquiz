# Trygdle

Wordle for Folketrygdfondets aksjeportefølje: finn selskapet på 6 forsøk.
Spill på **https://egil10.github.io/compquiz/**

## Regler

Skriv navn eller ticker og trykk Enter. Hvert forsøk gir sju ruter:

| Land | Sektor | Mcap | P/E | EV/EBITDA | Eier | Stiftet |
| --- | --- | --- | --- | --- | --- | --- |
| Flagg, pil mot fasit | Bransje | Børsverdi (NOK) | Trailing P/E | EV / EBITDA (TTM) | Folketrygdfondets eierandel | Stiftelsesår |

- **Grønn**: riktig (tall innen ±5 %)
- **Gul**: nær (beslektet sektor, tall innen ±25 %, stiftet innen ±10 år)
- **Grå**: feil. ↑ / ↓ viser om fasit er høyere eller lavere.
- **–**: ikke meningsfullt (negativt resultat, EV/EBITDA for finans).

Kursutviklingen i år vises over søkefeltet. **Hint** (3): by → fond (SPN/SFT) → logo (grå og uskarp → farget og uskarp → skarp). Deretter «Gi opp».

## Sider og lenker

| Adresse | Innhold |
| --- | --- |
| `./` | Dagens selskap |
| `./?2026-11-21` (eller `/2026-11-21`) | Selskapet for en bestemt dag – del lenken med venner |
| `./?frispill` | Frispill: tilfeldige selskaper fra hele porteføljen |
| `kalender.html` | Spill tidligere dager (fra 1. november 2026) |
| `statistikk.html` | Egen statistikk (kun dagens selskap teller; rekken brytes hvis du hopper over en dag) |
| `data.html` | Hele porteføljen som sorterbar tabell |
| `hjelp.html` | Slik spiller du |

Alle interne lenker laster en fersk side (cache-busting), så siden føles som en vanlig nettside.

## Dagens selskap

`daily_order.js` er en fast rekkefølge (frosset), slik at alle får samme selskap samme dag og
timeplanen aldri endrer seg når porteføljen eller dataene endres. Dag N etter 1.11.2026 = plass N;
når listen er brukt opp, går den gjennom på nytt i en annen rekkefølge. Selskaper som midlertidig
mangler data hoppes over.

## Data og automatisk oppdatering

GitHub Actions (`.github/workflows/update-data.yml`) kjører hver morgen (ca. kl. 05–06 norsk tid):

1. `scripts/update_data.py` henter beholdningen fra Folketrygdfondet og markedsdata fra Yahoo Finance.
2. `scripts/stamp_assets.py` gir alle .js/.css-filer nye versjonslenker (unngår gammel cache).
3. Endringer committes og GitHub Pages publiserer automatisk.

Hvis en kilde feiler, beholdes forrige dags tall (siden fungerer alltid). Kan også kjøres manuelt:
Actions → «Update market data» → «Run workflow».

| Fil | Innhold | Kilde |
| --- | --- | --- |
| `portfolio_data.js` | Alle selskaper i SPN og SFT, beholdning, eierandel, sektor | [folketrygdfondet.no](https://www.folketrygdfondet.no/nb/folketrygdfondet/portefoljeoversikt/selskaper) |
| `market_data.js` | Børsverdi, kurs, P/E, EV/EBITDA, utbytte, kurs i år, nettside | Yahoo Finance (yfinance) |
| `scripts/overrides.json` | Håndsjekkede verdier: stiftelsesår, beskrivelser, nettsider, logoer, unoterte selskaper | Research-gjennomganger |
| `logos/` | Logoer | Selskapenes nettsider / Wikimedia |

Lokalt:

```
pip install yfinance pillow
python3 scripts/update_data.py      # --refresh-logos for å hente logoer på nytt
python3 scripts/stamp_assets.py
python3 -m http.server 8765         # og åpne http://127.0.0.1:8765/
python3 scripts/navtest.py http://127.0.0.1:8765/   # klikker gjennom alle lenker (pip install websocket-client)
```

Tall rapportert i annen valuta enn noteringen (f.eks. Equinor i USD) valutajusteres. Unoterte poster
får en implisitt verdi fra Folketrygdfondets post (vist med ≈). Kun til underholdning, ikke investeringsråd.
