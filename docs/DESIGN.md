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
> **Status 2026-07-30:** niet langer alleen papierwerk. De tokenlaag (`app/globals.css`) en
> `button.tsx`/`input.tsx` staan op de kit-waarden (2.0b stap 1 en 3). De logo-assets staan in
> de repo en de favicon is aangesloten (O7 gesloten). Fonts staan nog op `Geist` (O2).

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

De web-assets staan sinds 2026-07-30 in de repo op **`public/brand/`**, byte-identiek aan de
twee geleverde merkpakketten (O7 gesloten). De `.ai`/`.eps`/`.pdf` zijn bewust níet meegekomen —
dat is drukwerk, geen web.

| Bestand (`public/brand/`) | Gebruik |
|---|---|
| `lockup_horizontaal_kleur.svg` (5:1) | **standaardlogo** — websitekop, briefpapier, e-mail |
| `lockup_gestapeld_kleur.svg` (1,67:1) | social avatar, vierkante ruimtes |
| `lumenlogic_logo.svg` | beeldmerk los, zonder vaste maat (responsive) — **dit is wat de navbalk gebruikt** |
| `logo_mono-zwart.svg` | één kleur, lagen blijven leesbaar door uitgesneden spleet |
| `logo_silhouet-zwart.svg` | één dichte vorm — borduren, stempels, graveren, alles onder ~12 mm |
| `favicon.ico` / `favicon.svg` | web; de `.ico` bevat 16/32/48/64/128/256 px |
| `lumenlogic_logo_512/1024/2048px.png` | scherm met transparantie, Office-situaties |
| `lumenlogic_logo_witte-achtergrond.svg` | waar transparantie niet werkt (PowerPoint) |
| `LEESMIJ.txt` | de meegeleverde merkinstructie, ongewijzigd |

**Favicon aangesloten** via de Next-App-Router-conventies: `app/favicon.ico` (was de
Next.js-scaffoldstandaard) en `app/icon.svg` (= `favicon.svg`). Next zet daar zelf de twee
`<link rel="icon">`-regels voor neer; er is géén `metadata.icons` nodig. Geverifieerd op de
dev-server: beide worden geserveerd en de bytes zijn identiek aan `public/brand/`.

**Het woordmerk is `#0A0A0A`** — in álle geleverde lockups. Op navy `#1A1F3A` is dat 1,2:1 en
dus onzichtbaar. Er is géén mono-wit variant geleverd (zie O11). Het **beeldmerk** heeft dat
probleem niet: `lumenlogic_logo.svg` bevat alleen violet/magenta/overlap, geen inkt, en werkt
direct op donker. Daarom staat in de navbalk het beeldmerk plus de naam als platte witte tekst —
op mobiel alléén het beeldmerk (de naam blijft `sr-only`, zodat de link zijn toegankelijke naam
houdt). Zie O11 en O12.

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

Twee dingen die §14 níét geeft en die zijn vastgelegd (zie O10): de **primaire CTA op donker**
is een wit vlak met navy tekst, en de **focus-ring op donker** is teal `#1BA89A` in plaats van
blauw. In light blijft de focus-ring blauw `#2D5A8C`.

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
| **O7** | De logobestanden staan nog niet in de repo (`public/`). | **Gesloten 2026-07-30:** de web-assets staan byte-identiek op `public/brand/` (geverifieerd met `cmp` tegen beide bronmappen), de favicon is aangesloten via `app/favicon.ico` + `app/icon.svg`. `.ai`/`.eps`/`.pdf` bewust niet meegenomen — drukwerk, geen web. Zie §2. |
| **O8** | **De kit spreekt zichzelf tegen over secundaire tekst.** §3 schrijft `#8E9BA8` voor, §11 eist 4.5:1 contrast. Op wit haalt die kleur 2,8:1 — zelfs onder de 3:1-drempel voor grote tekst. Er is geen lezing waarin beide kloppen. | **Besluit Timo 2026-07-30: kit-letterlijk, `#8E9BA8` blijft.** De app gaat dus bewust live met secundaire tekst onder WCAG AA, op vrijwel elke pagina. Dit is een geaccepteerde afwijking, géén bug — niet "opruimen". Bij Eduard neerleggen samen met O1. |
| **O9** | **44px minimumhoogte geldt niet overal.** Kit §7 eist min. 44px voor knoppen; de codebase heeft 56× `size="sm"` (28px), 2× `xs` en 4× `icon-*` in dense tabellen en admin-toolbars. | **Besluit Timo 2026-07-30:** 44px voor `default`, `lg` en formuliervelden; de compacte maten blijven zoals ze zijn. Bewuste afwijking van §7 — niet later stilzwijgend naar 44px trekken. |
| **O10** | Kit §14 dekt dark mode niet volledig: er is geen primaire knop en geen focus-ring voor donker. | **Besluit Timo 2026-07-30:** primaire CTA op donker = wit vlak met navy tekst (§3: "Wit: CTA's op donker"). Focus-ring op donker = teal `#1BA89A` (5,4:1); blauw haalt daar maar 2,25:1. Beide kit-kleuren, niets verzonnen. |
| **O11** | **De mono-wit lockup is belóófd maar niet geleverd.** `LEESMIJ.txt` schrijft bij `02_lockup`: "Elk in kleur, mono-zwart en mono-wit". In het pakket zitten alleen kleur, mono-zwart en silhouet-zwart — geen enkel wit bestand (geverifieerd op de inhoud van beide bronmappen, niet op de bestandsnamen). Kit §2 sanctioneert de variant wél ("Monochrome (White) — on dark backgrounds"). Daardoor is er geen lockup die op de navy balk kan staan: het woordmerk is `#0A0A0A` = 1,2:1. | **Besluit Timo 2026-07-30: optie 3 — alleen het beeldmerk op navy, zonder woordmerk.** `lumenlogic_logo.svg` heeft geen inkt-kleur en werkt direct op donker; de naam staat ernaast als platte witte tekst. Er is dus **niets herkleurd** (kit §15 en de LEESMIJ verbieden dat). Blijft openstaan: de mono-wit lockup alsnog bij Eduard opvragen, dan kan het volledige lockup in de balk. Tot die tijd niet zelf genereren. |
| **O12** | **De navigatiebalk is navy — dat staat niet in de kit.** §3 wijst navy toe aan "primair accent, CTA's, nadruk" en zet wit als app-canvas (§3 Canvas System); een navy chrome-balk komt er nergens in voor, en §14 levert alleen een dark-palet, geen donker vlak ín light. | **Besluit Timo 2026-07-30: bewuste toevoeging bovenop de kit, expliciet gevraagd (navy balk + teal-accent).** Balk `#1A1F3A`, productnaam wit (16,1:1), inactieve items `#B0B8C4` uit §14 (8,1:1), actief item wit met een 2px teal onderstreping `#1BA89A` (5,5:1) — §8 gebruikt teal al als accentlijn op een navy vlak. Uitsluitend kit-kleuren. Gevuld teal is afgewezen: wit-op-teal haalt 2,95:1. Eigen tokenlaagje `--nav-*`, bewust níet overschreven in `.dark` (de balk is in beide standen hetzelfde vlak); `components/huisstijl.test.tsx` pint dat vast door ze in LIGHT_TOKENS én DARK_TOKENS te zetten. Gevolg: binnen de balk is de focus-ring óók in light teal, want blauw haalt daar 2,3:1 — zelfde redenering als O10. In de dossier-tabbalk is de actieve streep teal op wit = **2,95:1**, onder de 3:1-drempel voor UI-elementen; aanvaard omdat de stand óók door labelkleur (17,4:1) en gewicht wordt gedragen, dus kleur is niet het enige onderscheid (§11). **Niet "terugzetten naar de kit"** — het witte canvas doortrekken tot in de balk is een regressie, geen correctie. |
| **O13** | **De statuskleuren zijn géén kit-kleuren.** De code gebruikte 207 hardgecodeerde Tailwind-paletklassen (amber 77 · emerald 42 · slate 32 · sky 28 · rose 15 · violet 9 · orange 4) in 27 bestanden. De kit levert vijf kleuren (§3 technisch palet) voor **zes** matcher-statussen, en er is geen route naar kit-letterlijk zonder afgeleide kleuren. Nagemeten in een echte browser, niet geschat: kit-blauw `#2D5A8C` haalt op wit 5,87:1 maar op de navy kaart in dark **2,09:1**; dark-rood met ongemengde `#D84C4C` haalt **3,40:1**; het naïeve recept `bg-X/10 text-X` haalt 2,02–3,69:1 terwijl de huidige Tailwind-paren 6,4–10,4:1 halen. Kit-letterlijk zou de app dus **minder** toegankelijk maken. Bovendien **zíjn de statuslabels de kleurnamen** (`label: "Blue"`, `word: "Purple"` — MASTERPLAN §3, FUNCTIONEEL-ONTWERP §577 eist het woord voor zwart-witprint) en `word` wordt letterlijk afgedrukt: "Yellow" naar oranje zetten maakt het papier onwaar. | **Besluit Timo 2026-07-30: het mechanisme gaat om, de hues worden bevroren.** De kleuren staan nu als `--status-{green,amber,blue,red,purple,grey,orange}-{tint,ink,dot}` in `globals.css`, met **exact** de Tailwind-waarden, letterlijk overgenomen uit `node_modules/tailwindcss/theme.css` (dus als `oklch`, niet geconverteerd). De app ziet er identiek uit; `components/huisstijl.test.tsx` pint elke waarde vast plus een guard dat ze géén kit-kleur zijn. Opbrengst: de paletklassen zijn uit de componenten, en `status.ts` regel 1 ("één bron van waarheid") is voor het eerst waar — de PDF had een eigen, losse kopie van het palet, die staat nu als `STATUS[...].print` op dezelfde plek (bewust dónkerdere inkten dan het scherm; papier heeft geen backlight, dus gelijktrekken is niet de bedoeling). **Openstaand voor Eduard:** een zes-kleuren-statusramp met tint/inkt-paren, samen met O1/O8. Tot die er is: niet zelf naar het kit-palet trekken. De dark-paren (`-950`/`-300`) zijn nooit op contrast nagerekend — dat hoort bij dezelfde vraag. |

---

## 12. Waar de brand kit voorgaat

Dit document is een werkbare samenvatting voor developers, geen vervanging. Bij twijfel of
tegenspraak: **`lumenlogic_brand_kit.md` wint**, behalve waar §1 en §11 expliciet iets anders
vastleggen. Wijkt de praktijk af van beide? Vragen, niet oplossen.
