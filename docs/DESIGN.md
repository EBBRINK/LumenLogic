# DESIGN.md — huisstijl-referentie voor developers

> Vastgelegd 2026-07-30 door Timo. Bron: **[`docs/brand/lumenlogic_brand_kit.md`](brand/lumenlogic_brand_kit.md)
> v2.0 (juli 2026)** plus de twee geleverde merkpakketten (`lumenlogic logo files.zip`,
> `logos lumenlogic deel 2.zip`). De brand kit noemt deze plek zelf (§21, "CSS Variables:
> Maintain DESIGN.md for developer reference").
>
> De kit staat sinds 2026-07-30 als **read-only kopie** in de repo, byte-identiek aan het
> origineel, zodat parallelle sessies erbij kunnen. Verwijzingen naar "§x" hieronder slaan op
> paragrafen in dat bestand.
>
> **Twee harde regels:**
> 1. De brand kit is leidend. Het MD-bestand wordt **nooit** gewijzigd — ook niet als er een
>    fout in lijkt te staan. Correcties horen bij Eduard vandaan te komen.
> 2. Wijkt iets af van de brand kit, of ontbreekt het erin? **Eerst vragen aan Timo.** Niet
>    zelf invullen, niet stilzwijgend een keuze maken. Openstaande vragen staan in §11.
>
> **Status:** papierwerk. Er is nog géén app-code op deze waarden aangepast — `globals.css`,
> componenten en fonts staan nog op de oude situatie. Dat gebeurt in 2.0a, niet eerder.

---

## 1. Bekende, bewuste afwijking: twee paletten

Dit is het belangrijkste punt van dit document en het staat bewust bovenaan.

**Het geleverde logo is violet/magenta. Die kleuren komen nergens in de brand kit voor.**
§3 van de kit is volledig navy/blauw/teal. Er is dus geen enkele plek waar de kit voorschrijft
welke kleur het logo moet hebben — het conflict is niet opgeschreven, het bestaat feitelijk.

| | Palet | Waar |
|---|---|---|
| **Logo** | violet `#7C5CFF` · magenta `#EC5CD6` · overlap `#7321D6` | de geleverde logobestanden |
| **UI + marketing** | navy `#1A1F3A` · blauw `#2D5A8C` · teal `#1BA89A` | brand kit §3 |

**Besluit tot nader order:** we draaien bewust met twee paletten. Het logo blijft exact zoals
geleverd (niet herkleuren — de LEESMIJ verbiedt dat expliciet, brand kit §15 ook). De interface
en marketing volgen §3.

**Open vraag, niet opgelost:** welk palet is canoniek als de twee ooit verzoend moeten worden?
Trekt het logo de UI naar violet/magenta, of wordt het logo op termijn naar navy/teal gebracht?
Te bevestigen met Eduard zodra hij er is (~21 augustus 2026). Tot dat gesprek: logo zoals
geleverd, UI per §3, en niemand kiest hier zelf iets in.

Waarschijnlijke verklaring, niet bevestigd: de kleurbeschrijving in de kit is er via de
AI-route van Eduard ingekomen en sluit niet aan op het werkelijke ontwerp. Zie ook §11-O1.

---

## 2. Logo

Het merk: twee overlappende L-lagen. Waar ze elkaar raken ontstaat een derde, diepere tint.
Twee L's, één vorm.

### Bestanden

| Bestand | Gebruik |
|---|---|
| `lockup_horizontaal_kleur.svg` (5:1) | **standaardlogo** — websitekop, briefpapier, e-mail |
| `lockup_gestapeld_kleur.svg` (1,67:1) | social avatar, vierkante ruimtes |
| `lumenlogic_logo.svg` | beeldmerk los, zonder vaste maat (responsive) |
| `logo_mono-zwart.svg` | één kleur, lagen blijven leesbaar door uitgesneden spleet |
| `logo_silhouet-zwart.svg` | één dichte vorm — borduren, stempels, graveren, alles onder ~12 mm |
| `favicon.ico` / `favicon.svg` | web; de `.ico` bevat 16/32/48/64/128/256 px |
| `.ai` `.eps` `.pdf` `.png` | druk, sign, Office-situaties (print-vectoren op 512×512 pt artboard) |

Het woordmerk is omgezet naar vectorpaden — er zit géén lettertype in de bestanden, dus niets
kan bij een drukker omvallen.

### Gebruiksregels

- **Vrije ruimte:** minimaal de dikte van een L-stam rondom het logo.
- **Minimale maat:** beeldmerk 24 px scherm / 8 mm druk · horizontaal lockup 120 px / 40 mm.
  Kleiner? Gebruik het silhouet.
- **Donkere ondergrond:** de kleurversie werkt direct, de kleuren zijn helder genoeg.
  Anders de mono-wit variant.
- **Formaat:** altijd SVG waar het kan. Niet rasteren als het niet hoeft.

**Niet doen:** uitrekken · roteren · herkleuren · schaduw, glow of gradient toevoegen · de twee
lagen uit elkaar trekken · het woordmerk in een ander lettertype overtypen · naast een ander
logo op gelijke prominentie zetten.

---

## 3. Kleuren

### Logo (vast, niet aanpassen)

| Naam | Hex | RGB |
|---|---|---|
| Violet — achterste L | `#7C5CFF` | 124, 92, 255 |
| Magenta — voorste L | `#EC5CD6` | 236, 92, 214 |
| Overlap — doorsnede | `#7321D6` | 115, 33, 214 |
| Inkt — woordmerk | `#0A0A0A` | 10, 10, 10 |

De overlapkleur is de exacte multiply-uitkomst van violet × magenta, maar staat als **vaste
kleur** in het bestand. Geen transparantie, geen blend modes — daardoor identiek op scherm,
in druk en in elke app. Niet vervangen door een echte transparantie-laag.

### UI en marketing (brand kit §3)

| Naam | Hex | Gebruik |
|---|---|---|
| Navy (primair) | `#1A1F3A` | primair accent, CTA's, nadruk, donker canvas |
| Professional Blue (secundair) | `#2D5A8C` | secundaire elementen, links, focus-ring |
| Slate Grey | `#3F4A5C` | tekst, donkere achtergronden |
| Light Neutral | `#F0F2F5` | kaartachtergrond, lichte vlakken |
| Accent Teal | `#1BA89A` | success-states, highlights, data-viz |
| Zwart (tekst) | `#1A1A1A` | bodytekst, koppen op licht |
| Wit | `#FFFFFF` | CTA's op donker, tekst op kleur |

**Canvas:** wit `#FFFFFF` (primair) · zacht grijs `#F5F7FA` (secundaire secties) ·
navy `#1A1F3A` (hero, premium, CTA-blokken). Zachte overgangen, geen harde knippen.

**Data-viz:** positief `#1BA89A` · negatief `#D84C4C` · waarschuwing `#FF9500` ·
neutraal `#8E9BA8` · focus `#2D5A8C`.

**Randen en velden:** rand `#E5E9F0` · invoerrand `#D0D6E0` · invoerachtergrond `#F5F7FA`.

### Dark mode — verplicht

Kit §14 noemt dark mode "optional future", maar **besluit G24: dark mode blijft verplicht.**
Geen tegenspraak in de praktijk: de app ship al light én dark, `CLAUDE.md` eist screenshots in
beide standen bij elke feature, en §14 lévert het dark-palet. Gebruik die tokens.

| Element | Light | Dark |
|---|---|---|
| Achtergrond | `#FFFFFF` | `#0F1626` |
| Vlak (kaarten) | `#FFFFFF` | `#1A1F3A` |
| Zacht canvas | `#F5F7FA` | `#2A3145` |
| Tekst primair | `#1A1A1A` | `#FFFFFF` |
| Tekst secundair | `#8E9BA8` | `#B0B8C4` |
| Rand | `#E5E9F0` | `#3A4254` |
| Invoerachtergrond | `#F5F7FA` | `#2A3145` |

Het logo hoeft in dark niet te wisselen: de kleurversie werkt direct op donker, de kleuren zijn
helder genoeg. Alleen bij twijfel de mono-wit lockup.

**Niet doen:** gradiënten maken (staan niet in het merk) · secundaire kleuren in primaire CTA's ·
kleur puur decoratief inzetten · WCAG 4.5:1 negeren.

---

## 4. Typografie

**Inter overal** — display én body. Eén font, geen tweede typeface erbij (brand kit §4, §19-6).
Licentie SIL OFL. Code/API: SF Mono of JetBrains Mono.

| Rol | Gewicht | Maat | Regelhoogte |
|---|---|---|---|
| Hero headline | 700 | 64–96 px | 1.2 |
| Sectiekop | 600 | 36–48 px | 1.2 |
| Subkop | 600 | 24–32 px | 1.2 |
| Body marketing | 400 | 16–18 px | 1.6 |
| Body UI | 400 | 13–15 px | 1.5 |
| Label / knoptekst | 500 | 14–15 px | 1.4 |
| Nadruk / datalabel | 600 | 13–14 px | 1.4 |

Responsief: H1 28 px mobiel · 36 px tablet · 64–96 px desktop. H2 22 / 28 / 36–48 px.
Body 15 / 16 / 16–18 px. Minimum 13 px (UI), 14 px (marketing). Regellengte 70–80 tekens.

> **Let op bij 2.0a:** `app/layout.tsx` laadt nu `Geist` en `Geist_Mono`, niet Inter. Dat is
> een openstaand verschil met de kit — zie §11-O2. Nog niet aangepast.

Het woordmerk in het logo staat los van deze regel: dat zijn outlines in Poppins, geen levend
lettertype. De logobestanden worden niet aangeraakt.

---

## 5. Ruimte en raster

**8px-grid.** xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48 · 3xl 64 · 4xl 96.

- Knoppen: 10 px verticaal × 16 px horizontaal, min. 44 px hoog
- Kaarten: 20 px padding (24 px voor marketing-kaarten)
- Invoervelden: 12 px verticaal × 14 px horizontaal
- Sectiegoten: 16 px mobiel · 24 px tablet · 32 px desktop
- Hero: 48–64 px boven/onder op desktop

**Containers:** mobiel/tablet vol breed · desktop max. 1280 px · ultrawide max. 1440 px (zeldzaam).

**Breekpunten:** mobiel 320–768 · tablet 768–1024 · desktop 1024–1280 · ultrawide 1280+.
Dashboard-grid: 4 koloms mobiel, 8 tablet, 12 desktop, 16 px tussenruimte.

---

## 6. Componenten

### Knoppen

| | Achtergrond | Tekst | Rand | Font |
|---|---|---|---|---|
| Primair | `#1A1F3A` | `#FFFFFF` | geen | Inter 600, 15 px |
| Secundair | transparant | `#2D5A8C` | 2 px `#2D5A8C` | Inter 600, 15 px |
| Tertiair (ghost) | transparant | `#2D5A8C` | geen | Inter 500, 14 px |

Radius 6 px, hoogte min. 44 px. Primair hover `#0F1626` + schaduw `0 2px 8px rgba(26,31,58,.2)`;
active schaal 0.98 op `#0A0E18`. Disabled 50% opacity.
**Geen pill-vormen** — extreme afronding haalt het professionele eruit (§19-1).

### Invoer

Achtergrond `#F5F7FA`, rand 1 px `#D0D6E0`, radius 6 px, padding 12×14 px, Inter 400 15 px.
Focus: wit vlak, rand 2 px `#2D5A8C`, ring `0 0 0 3px rgba(45,90,140,.1)`.
Fout: rand 2 px `#D84C4C` + ring. Succes: rand 1 px `#1BA89A` + vinkje.
Foutmelding Inter 400 13 px `#D84C4C`, 4 px onder het veld, fade-in 150 ms.
Veld-tot-veld 20 px, label-tot-veld 6 px, sectie-tot-sectie 32–48 px.

### Kaarten

| Type | Achtergrond | Radius | Padding | Rand / schaduw |
|---|---|---|---|---|
| Standaard (dashboard) | `#FFFFFF` | 8 px | 20 px | 1 px `#E5E9F0` · `0 2px 8px rgba(0,0,0,.06)` |
| Feature (marketing) | `#F5F7FA` | 8 px | 24 px | geen schaduw |
| Premium | `#1A1F3A`, witte tekst | 8 px | 24 px | teal accent links (4 px) |
| Data / KPI | `#FFFFFF` | 6 px | 16 px | 1 px `#E5E9F0` |

KPI-getal Inter 700 28 px `#1A1F3A`; label Inter 400 13 px `#8E9BA8`.
Hover: alleen schaduw, geen schaalsprong. Transitie 150 ms ease-out.

---

## 7. Toegankelijkheid

- Contrast minimaal **4.5:1** (normale tekst), 3:1 (grote tekst en UI-elementen).
- Focus-ring: 2 px `#2D5A8C`, offset 2 px, radius 4 px — **altijd zichtbaar**, op elk
  interactief element.
- Kleur is nooit het enige onderscheid: altijd ook een icoon, tekst of patroon.
- Alles bereikbaar met toetsenbord, logische tab-volgorde.

---

## 8. Beweging

Hover 150 ms ease-out · klik-feedback 100 ms schaal 0.96–1.0 · validatie 200 ms fade-in ·
paginalading 300 ms fade-in · modal open 200 ms (schaal 0.95→1.0 + fade) · modal dicht 150 ms.

Easing: entree `cubic-bezier(0,0,.2,1)` · exit `cubic-bezier(.4,0,1,1)` ·
interactie `cubic-bezier(.4,0,.2,1)`.

Niets boven 400 ms. `prefers-reduced-motion` altijd respecteren. Beweging alleen met een doel.

---

## 9. Beeld

Professioneel, echt, vakgericht: architecten en lichtontwerpers aan het werk, projectrenders,
echte installaties, schermafbeeldingen uit het platform. Géén stockfoto-look, geen speelse
lifestyle, geen oververzadigde kleuren, geen geïsoleerde productshots zonder context.

Illustraties en iconen: minimaal en technisch. Iconen 24 px basis, 1,5 px lijndikte.
Lijnwerk 1–2 px. Diagrammen monochroom navy/slate met teal voor de sleutelroute.

---

## 10. Schrijfstijl

Expert, betrouwbaar, efficiënt, professioneel, versterkend. Actieve zinnen, 15–20 woorden
gemiddeld, uitkomst vóór functie. AI/technologie noemen mag, maar er niet mee openen.

✅ "Quote complex projects in seconds" · "Built by lighting professionals, for lighting professionals"
❌ "Revolutionary technology disrupting traditional lighting distribution"

---

## 11. Open punten

Niets hiervan zelf invullen. Alles hier gaat eerst langs Timo, en waar aangegeven langs Eduard.

| # | Punt | Status |
|---|---|---|
| **O1** | **Welk palet is canoniek** als logo (violet/magenta) en UI (navy/teal) verzoend moeten worden? Zie §1. | Te bevestigen met Eduard, ~21 aug 2026. Tot dan: logo zoals geleverd, UI per §3. |
| **O2** | App draait op `Geist`/`Geist_Mono`, de kit schrijft Inter voor. | Wijziging staat gepland voor 2.0a, nog niet uitgevoerd. |
| **O3** | Kit §14 noemt dark mode "optional future, niet vereist voor v1.0", `CLAUDE.md` eist light **én** dark bij elke feature. | **Gesloten (besluit G24):** dark mode blijft verplicht, met de §14-dark-tokens. Zie §3. |
| **O4** | Kit §2/§3 beschrijft het beeldmerk als translucente cirkels/ringen met opacity-lagen (100/65/35/15%). Het geleverde logo is twee L-vormen met vaste kleuren en expliciet géén transparantie. | Besluit: geleverde bestanden aanhouden, MD blijft ongewijzigd. Geen actie nodig, wel weten dat het er staat. |
| **O5** | Kit §15 noemt mono-zwart "primary"; het merkpakket noemt de kleur-lockup het standaardlogo. | Besluit Timo: geleverde bestanden aanhouden — kleur-lockup is standaard, mono waar kleur niet kan. |
| **O6** | Het canonieke `lumenlogic_brand_kit.md` stond buiten de repo. | **Gesloten:** byte-identieke read-only kopie op `docs/brand/lumenlogic_brand_kit.md`. Het origineel is niet aangeraakt. |
| **O7** | De logobestanden staan nog niet in de repo (`public/`). | **Voorwaarde voor de 2.0b-bouwchip**, die pas ná 2.0a start. Nu niet doen. Assets ongewijzigd overnemen uit de twee merkpakket-zips. |

---

## 12. Waar de brand kit voorgaat

Dit document is een werkbare samenvatting voor developers, geen vervanging. Bij twijfel of
tegenspraak: **`lumenlogic_brand_kit.md` wint**, behalve waar §1 en §11 expliciet iets anders
vastleggen. Wijkt de praktijk af van beide? Vragen, niet oplossen.
