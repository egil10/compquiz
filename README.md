# Folketrygdle

Et Wordle-inspirert daglig finansspill: gjett selskapet i Folketrygdfondets aksjeportefølje på 6 forsøk.

## Slik spiller du

Skriv selskapsnavn eller ticker (f.eks. `EQNR`, `NOVOB`) og trykk Enter. Hvert forsøk gir fem fargede ruter:

| Rute | Grønn | Gul | Pil |
| --- | --- | --- | --- |
| **Land** | Riktig land | – | Peker mot fasitens land |
| **Sektor** | Riktig sektor | Beslektet sektor | – |
| **Børsverdi** | Innen ±15 % | Innen 2x | ↑ fasit er større / ↓ mindre |
| **P/E** | Innen ±15 % | Innen 1,5x | ↑ / ↓ |
| **EV/EBITDA** | Innen ±15 % | Innen 1,5x | ↑ / ↓ |

`–` betyr at tallet ikke er meningsfullt (negativt resultat, eller EV/EBITDA for finansselskaper).

**Hint** gir opptil tre ledetråder (Folketrygdfondets eierandel og post, hovedkontor, beskrivelse). Etter tre hint blir knappen til «Gi opp».

**Daglig** gir alle samme selskap hver dag. **Frispill** gir ubegrenset med tilfeldige runder. Kun daglige runder teller i statistikken.

## Filer

- `portfolio_data.js` – porteføljedata (land, sektor, børsverdi, eierandel m.m.)
- `multiples.js` – børsverdi, kurs, P/E og EV/EBITDA fra Yahoo Finance (generert)
- `scripts/update_multiples.py` – henter ferske tall: `pip install yfinance && python3 scripts/update_multiples.py`
- `app.js`, `styles.css`, `index.html` – selve spillet (ingen byggesteg, bare åpne `index.html`)

P/E er trailing 12 måneder, EV/EBITDA er enterprise value / EBITDA (TTM). Tall rapportert i annen valuta enn noteringen (f.eks. Equinor i USD) valutajusteres. EV/EBITDA settes til «–» for finansselskaper. Dato for datauttrekket vises nederst i spillet. Kun til underholdning, ikke investeringsråd.
