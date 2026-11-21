# 🏛️ FOLKETRYGDLE 2026 — Folketrygdfondet Portefølje-Quiz

En **Wordle / Tradle / Worldle**-inspirert finans- og selskapsquiz bygget på **Folketrygdfondets offisielle aksjeportefølje for 2026** (*Statens pensjonsfond Norge – SPN* og *Statens fond i Tromsø – SFT*, pr. 30. juni 2026).

👉 **Spill direkte i nettleseren via GitHub Pages!**

---

## 🎯 Slik fungerer spillet

Målet er å gjette seg frem til det hemmelige porteføljeselskapet på opptil **6 forsøk**. For hvert selskap du gjetter får du umiddelbar tilbakemelding på **6 nøkkeldimensjoner**:

1. **🌍 Land & Kompassretning** (`🇳🇴 Norge`, `🇸🇪 Sverige`, `🇩🇰 Danmark`, `🇫🇮 Finland`, `🇮🇸 Island`)
   - 🟩 **Grønn**: Riktig land!
   - ⬛ **Kompasspil**: Viser geografisk himmelretning (`⬆️ Nord`, `⬅️ Vest`, `↘️ Sørøst` osv.) fra ditt gjettede land til målselskapets hjemland.
2. **🏭 ICB-Sektor (Bransje)**
   - 🟩 **Grønn**: Eksakt riktig offisiell ICB-sektor i Folketrygdfondet (*Energi, Finans, Industri, Materialer, Konsumvarer, Varige konsumvarer, Teknologi, Helse, Telekommunikasjon, Forsyning, Eiendom*).
   - 🟨 **Gul**: Nærbeslektet bransjeklynge (f.eks. *Konsumvarer* ↔ *Varige konsumvarer*, *Teknologi* ↔ *Telekommunikasjon*, *Energi* ↔ *Forsyning*, *Finans* ↔ *Eiendom*, *Industri* ↔ *Materialer*).
3. **💰 Børsverdi (Market Cap i mrd. NOK)**
   - 🟩 **Grønn**: Blink (innenfor ±15 % av målet).
   - 🟨 **Gul**: Nærme (innenfor faktor ~2,2x), med tydelig pil **⬆️ (målet er større)** eller **⬇️ (målet er mindre)**.
4. **🏛️ FTF-Post & Rangering (#1–#334)**
   - Hvor mye penger Folketrygdfondet har investert i selskapet (i MNOK / mrd. kr) samt rangering fra `#1` (*Equinor*, 28,5 mrd. kr) til `#334`.
5. **📊 FTF Eierandel (%)**
   - Hvor stor prosentandel av selskapet Folketrygdfondet eier (opptil 15 % på Oslo Børs og opptil 5 % i øvrige Norden).
6. **🏦 Fond / Mandat (`SPN` vs. `SFT`)**
   - Om aksjen eies gjennom hovedfondet **SPN** (*Statens pensjonsfond Norge*), det nye **SFT** (*Statens fond i Tromsø* for mindre nordiske selskaper), eller begge (**SPN + SFT**).

---

## 🧭 Hvorfor spillet alltid er gøy og vinnbart

- **Portefølje-Radar (Live Innsnevring)**: Oppdaterer automatisk hvilke land, bransjer og tallintervaller som er mulige etter hvert forsøk, og viser en klikkbar kandidatliste over selskaper som passer alle dine 🟩/🟨/⬆️/⬇️ ledetråder så langt.
- **3 Gratis Ledetråd-kort**:
  - 💡 *Ledetråd 1*: Hva selskapet produserer/driver med.
  - 📊 *Ledetråd 2*: Hovedkontor, aksjekurs i NOK og antall aksjer Folketrygdfondet eier.
  - 🔤 *Ledetråd 3*: Forbokstav, sluttebokstav, lengde og maskert børsticker.
- **4 Spillmoduser**:
  - 📅 **Dagens Selskap**: Nytt felles selskap hver dag med delbar emoji-score (`🟩🟨⬆️⬇️🟩🟩`).
  - 🌟 **Frispill: Kjente (Topp 105)**: Ubegrensede runder blant de største og mest kjente nordiske selskapene.
  - 🇳🇴 **Frispill: Oslo Børs (101)**: Kun norske selskaper i Folketrygdfondet.
  - 🏛️ **Frispill: Hele Norden (334)**: Alle 334 aksjeselskaper i både SPN og Statens fond i Tromsø (SFT).
- **📊 Portefølje-Utforskning**: Innebygd interaktiv tabell der du kan søke, filtrere og sortere alle 334 selskaper i 2026-porteføljen.
