# Trygdle

Wordle for Folketrygdfondets aksjeportefølje: finn selskapet på 6 forsøk.

## Regler

Skriv navn eller ticker og trykk Enter. Hvert forsøk gir sju ruter:

| Land | Sektor | Mcap | P/E | EV/EBITDA | Eier | Stiftet |
| --- | --- | --- | --- | --- | --- | --- |
| Flagg, pil mot fasit | Bransje | Børsverdi | Trailing P/E | EV / EBITDA (TTM) | Folketrygdfondets eierandel | Stiftelsesår |

- **Grønn**: riktig (tall innen ±5 %)
- **Gul**: nær (beslektet sektor, tall innen ±25 %, stiftet innen ±10 år)
- **Grå**: feil. ↑ / ↓ viser om fasit er høyere eller lavere.
- **–**: ikke meningsfullt (negativt resultat, EV/EBITDA for finans).

Kursutviklingen i år vises alltid over søkefeltet. **Hint** (3): by og fond (SPN/SFT) → utbytte → logo (grå og uskarp → farget og uskarp → skarp). Deretter «Gi opp».

**Daglig** gir alle samme selskap hver dag (forhåndsbestemt rekkefølge fra 1. november 2026, lik for alle). Kalenderen øverst lar deg spille tidligere dager. **Frispill** trekker fra hele porteføljen.

Dataene oppdateres automatisk hver morgen av GitHub Actions (`.github/workflows/update-data.yml`).

## Data

Alt genereres av `scripts/update_data.py`:

```
pip install yfinance
python3 scripts/update_data.py            # --refresh-logos for å hente logoer på nytt
```

| Fil | Innhold | Kilde |
| --- | --- | --- |
| `portfolio_data.js` | Alle selskaper i SPN og SFT, beholdning, eierandel, sektor | [folketrygdfondet.no](https://www.folketrygdfondet.no/nb/folketrygdfondet/portefoljeoversikt/selskaper) |
| `market_data.js` | Børsverdi, kurs, P/E, EV/EBITDA, utbytte, kurs i år | Yahoo Finance (yfinance) |
| | Stiftelsesår | Wikidata |
| `logos/` | Logoer | Google favicon-tjeneste |

Tall rapportert i annen valuta enn noteringen (f.eks. Equinor i USD) valutajusteres. Datoene for uttrekket vises nederst i spillet. Kun til underholdning, ikke investeringsråd.
