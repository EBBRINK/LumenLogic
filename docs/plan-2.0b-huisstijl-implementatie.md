# Plan 2.0b — huisstijl in de codebase

> Vastgelegd 2026-07-30. Twee onafhankelijke plan-agents (Fable) hebben elk de échte code
> gelezen en een implementatieplan gemaakt; dit document is hun convergentie. Basis:
> `origin/main` op `c5bd87a` plus de drie docs-commits van deze branch.
>
> Input: [`docs/DESIGN.md`](DESIGN.md) (merk-spec) en
> [`docs/brand/lumenlogic_brand_kit.md`](brand/lumenlogic_brand_kit.md) (read-only bron).
> Guardrails: kit is leidend (G23) · dark mode verplicht (G24) · brand-kit-MD niet aanraken ·
> geen web-assets ophalen.
>
> **Status: papier. Er is geen regel code gewijzigd.** De vier blockers zijn op 2026-07-30 door
> Timo beantwoord (§6); stap 1 en 3 van §8 zijn daarmee vrij. De bouw wacht op zijn go.

---

## 1. Wat we onderweg feitelijk hebben vastgesteld

Zes dingen die het plan veranderen en die niet uit de brand kit of DESIGN.md volgen:

1. **De token-flip is echt één bestand.** `node_modules/shadcn/dist/tailwind.css` (629 regels)
   levert alleen variants, keyframes en utilities — géén kleuren. Alle kleurtokens staan
   uitsluitend in `app/globals.css`.
2. **Het huidige palet is 100% achromatisch.** Elk van de ~30 oklch-tokens heeft chroma 0.
   Dit is de kale shadcn-greyscale; er zit vandaag geen merkkleur in de app.
3. **De screenshot-tests renderen zonder root-layout.** `vitest.setup.ts` importeert
   `app/globals.css` (nieuwe tokens komen dus automatisch mee), maar `app/layout.tsx` rendert
   niet — de `next/font`-classname die `--font-sans` zet ontbreekt. **Alle bestaande
   screenshot-PNG's tonen het systeemfont, niet Geist.** Dat blijft zo na de Inter-switch,
   tenzij het font als lokale woff2 in de repo komt (zie §5-A).
4. **26 bestanden hebben hardgecodeerde palet-utilities** buiten de tokenlaag: amber 72×,
   emerald 37×, slate 27×, sky 23×, orange 4× (163 voorkomens totaal, geverifieerd met grep).
   Die pakken de token-flip niet mee en gaan na stap 2 esthetisch vloeken.
5. **`--chart-1..5` en `--sidebar-*` worden nergens in componenten gebruikt** (grep leeg). Vrij
   te zetten, nul risico.
6. **Screenshot-PNG's zijn gitignored** (`**/*.test.png`) en worden per run vers gegenereerd.
   Before/after vergelijken is lokaal werk, niet via git.

Losse waarneming voor HANDOVER: `components.json` staat op `baseColor: neutral`. Elk primitive
dat later via `shadcn add` binnenkomt is achromatisch en moet handmatig langs deze tokenlaag.

---

## 2. Kleurnotatie: hex, niet oklch

Beide agents komen onafhankelijk op hetzelfde uit: **de kit-kleuren als hex in `:root` en
`.dark`**, elk met een commentaarregel naar de kit-paragraaf.

- Controleerbaarheid (G23): elke waarde in `globals.css` is byte-identiek terug te vinden in de
  kit. Een oklch-conversie op 3 decimalen maakt van elke review rekenwerk.
- Technisch nul verschil: Tailwind 4 bouwt opacity-modifiers met `color-mix(in oklab, …)` en dat
  accepteert hex net zo goed; ook de bestaande `color-mix(in oklch, var(--secondary), …)` in
  `button.tsx` werkt met hex-invoer.
- Het enige oklch-voordeel — handmatig aan L/C draaien — is hier juist onwenselijk: we mogen
  geen kleuren afleiden die de kit niet geeft.

Tegenargument, benoemd en niet gekozen: het bestand is nu consistent oklch, en
shadcn-upstream-diffs blijven in oklch leesbaarder. Wil Timo consistentie, dan zijn de
conversies (beide agents kwamen op identieke waarden) beschikbaar in de agent-rapporten.

---

## 3. Tokens — `app/globals.css`

### `:root` (light)

| Token | Waarde | Bron |
|---|---|---|
| `--background` | `#FFFFFF` | §3 Light Canvas |
| `--foreground` | `#1A1A1A` | §3 Black (tekst) |
| `--card` / `--card-foreground` | `#FFFFFF` / `#1A1A1A` | §8 |
| `--popover` / `--popover-foreground` | `#FFFFFF` / `#1A1A1A` | volgt card |
| `--primary` / `--primary-foreground` | `#1A1F3A` / `#FFFFFF` | §7 (16:1 ✓) |
| `--primary-hover` *(nieuw)* | `#0F1626` | §7 hover |
| `--primary-active` *(nieuw)* | `#0A0E18` | §7 active |
| `--secondary` / `--secondary-foreground` | `#F0F2F5` / `#1A1F3A` | §3 Light Neutral — zie §3.1 |
| `--muted` / `--muted-foreground` | `#F5F7FA` / `#8E9BA8` | §3 Soft Grey / Text Secondary — **besloten V1: kit-letterlijk**, ⚠ 2,8:1 = bewuste AA-afwijking |
| `--accent` / `--accent-foreground` | `#F0F2F5` / `#1A1F3A` | hover-vlak. Let op: shadcn-"accent" ≠ kit-"Accent Teal" |
| `--destructive` | `#D84C4C` | §3 Negative — ⚠ **V5** |
| `--border` | `#E5E9F0` | §3 |
| `--input` | `#D0D6E0` | §7 invoer**rand** (achtergrond gaat via `bg-muted`) |
| `--ring` | `#2D5A8C` | §11 focus |
| `--chart-1..5` | `#2D5A8C`, `#1BA89A`, `#FF9500`, `#D84C4C`, `#8E9BA8` | §3 Technical Palette |
| `--radius` | `0.375rem` | §4 hieronder |
| `--sidebar` / `-foreground` | `#F5F7FA` / `#1A1A1A` | geen sidebar-component; consistentie |
| `--sidebar-primary` / `-foreground` | `#1A1F3A` / `#FFFFFF` | spiegel primary |
| `--sidebar-accent` / `-foreground` | `#F0F2F5` / `#1A1F3A` | spiegel accent |
| `--sidebar-border` / `--sidebar-ring` | `#E5E9F0` / `#2D5A8C` | spiegel border/ring |

**Nieuwe merk- en statustokens** (plus `--color-*`-registratie in `@theme inline`):

```
--brand-navy: #1A1F3A;   --brand-blue: #2D5A8C;
--brand-teal: #1BA89A;   --brand-slate: #3F4A5C;
--success: #1BA89A;      --success-foreground: #FFFFFF;   /* ⚠ V6 */
--warning: #FF9500;      --warning-foreground: #1A1A1A;
```

Waarom aparte `--brand-*`: de kit-"secundaire kleur" (blauw) en "accent" (teal) botsen met
shadcn's semantiek, waar `--secondary` en `--accent` *vlakken* zijn en geen merkkleuren. Met
aparte brand-tokens blijven beide vocabulaires zuiver en kunnen componenten `text-brand-blue`,
`border-brand-blue`, `bg-success` gebruiken.

**Bewust NIET als token:** violet `#7C5CFF`, magenta `#EC5CD6`, overlap `#7321D6`. Dat is het
logo-palet (DESIGN.md §1). Het komt uitsluitend als pixels in de logobestanden de repo in
(O7) — nooit als CSS-variabele, anders sijpelt het de UI in.

### 3.1 Waarom `--secondary` géén blauw wordt

Er zijn 21 plekken met `variant="secondary"` (Button/Badge), bedoeld als "onopvallende
actie/status". Zou `--secondary` blauw `#2D5A8C` worden, dan zijn dat ineens 21 gevulde blauwe
knoppen — een variant die de kit niet kent (kit-secundair is *transparant met blauwe rand*).
De kit-secundaire knop landt daarom in de `outline`-variant (29 usages, semantisch al "omrande
secundaire actie"), en `--secondary` blijft een neutraal grijs vlak. Dit is een interpretatie →
**V12**.

### 3.2 `.dark` (verplicht, G24)

| Token | Waarde | Bron |
|---|---|---|
| `--background` | `#0F1626` | §14 |
| `--foreground` | `#FFFFFF` | §14 |
| `--card` / `--card-foreground` | `#1A1F3A` / `#FFFFFF` | §14 Surface |
| `--popover` / `-foreground` | `#1A1F3A` / `#FFFFFF` | = surface |
| `--secondary` / `--accent` | `#2A3145`, foreground `#FFFFFF` | §14 Canvas (Soft) |
| `--muted` / `--muted-foreground` | `#2A3145` / `#B0B8C4` | §14 (9:1 ✓) |
| `--border` | `#3A4254` | §14 — **solide**, vervangt de huidige `oklch(1 0 0 / 10%)` |
| `--input` | `#3A4254` | rand; achtergrond via `bg-muted` = `#2A3145` = exact §14 Input Bg ✓ |
| `--primary` / `--primary-foreground` | `#FFFFFF` / `#1A1F3A` | **besloten V3.** §14 geeft geen primary; §3 zegt dat wit voor "CTA's op donker" is. Navy-op-navy is ≈1:1 |
| `--ring` | `#1BA89A` | **besloten V4.** Blauw haalt 2,25:1 op kaart-navy en faalt §11; teal haalt 5,4:1 en is een kit-kleur |
| `--destructive`, `--chart-*`, `--success`, `--warning`, `--brand-*` | gelijk aan light | §14 geeft geen dark-varianten — niets verzinnen |
| `--sidebar` | `#1A1F3A`, border `#3A4254`, ring `#1BA89A`, rest analoog | afgeleid van surface |

De twee gaten die §14 niet dekt (`--primary` en `--ring`) zijn met V3 en V4 gedicht, allebei met
een kleur die de kit zelf levert. Dark-hover en -active blijven ongedefinieerd: niet verzinnen,
maar afleiden via `color-mix(in oklch, var(--primary), black 12%)` op een kit-kleur.

Dat de dark-randen van translucent naar solide gaan is een bewuste kit-keuze. Op gekleurde
vlakken (navy kaart op donker canvas) gedraagt solide zich anders — beoordelen op de
screenshots, niet aannemen.

---

## 4. Radius — zonder de schaal te breken

Nu: `--radius: 0.625rem` (10px) met multiplicatieve calc-keten. Button/input gebruiken
`rounded-lg`, card/dialog `rounded-xl`, badge `rounded-4xl` (de-facto pill). 46 bestanden
gebruiken zelf `rounded-*`.

Kit wil 6px (knop/input/KPI), 8px (kaart), 4px (focus-hoeken).

**Oplossing: `--radius: 0.375rem` én de calc-keten vervangen door vaste waarden** in
`@theme inline`:

```
--radius-sm: 0.25rem;        /* 4px — focus-hoeken §11 */
--radius-md: 0.375rem;       /* 6px */
--radius-lg: var(--radius);  /* 6px — knop, input, KPI  */
--radius-xl: 0.5rem;         /* 8px — kaart, dialog     */
--radius-2xl: 0.75rem;  --radius-3xl: 1rem;  --radius-4xl: 1.5rem;
```

**Geen enkel component hoeft hiervoor aangepast:** `rounded-lg` wordt vanzelf 6px, `rounded-xl`
vanzelf 8px, en de 46 bestanden schuiven automatisch mee. Alleen `--radius` verlagen werkt níet
— de ×1.4-factor geeft dan 8,4px in plaats van 8px en `sm` wordt 3,75px, allebei off-grid. Vast
pinnen is de enige route naar exact 6/8/4. De `rounded-[min(var(--radius-md),10px)]`-constructies
in de button-subsizes resolven netjes naar 6px.

Achterblijver: de badge blijft door `rounded-4xl` een pill → **V7**.

Optioneel in dezelfde beweging: `--text-xs: 0.8125rem` (13px). De kit eist minimaal 13px
UI-tekst en `text-xs` staat nu op 12px, o.a. in badges en tabellabels. Eén regel lost dat overal
op, maar raakt dense tabellen → **V15**.

---

## 5. Componenten

Alle zes primitives zijn ≤ ~170 regels.

**`button.tsx`** — grootste ingreep.
- Base: `active:translate-y-px` → `active:scale-[0.98]` (§7). Focus: zie **V11**.
- `default`: `text-[15px] font-semibold`, `hover:bg-primary-hover`
  `hover:shadow-[0_2px_8px_rgba(26,31,58,0.2)]`, `active:bg-primary-active` — vervangt
  `hover:bg-primary/80`.
- `outline` wordt kit-secundair: `border-2 border-brand-blue text-brand-blue bg-transparent
  hover:bg-brand-blue/5`, 15px/600.
- `ghost` wordt kit-tertiair: `text-brand-blue text-sm font-medium hover:bg-brand-blue/10
  hover:underline`.
- `secondary`: geen edit, kleurt via tokens naar grijs vlak + navy tekst.
- `size.default`: `h-8 px-2.5` → `h-11 px-4` (44px, 16px horizontaal); `lg` → `h-12`.
  **Besloten V2:** `sm` (56×), `xs` (2×) en `icon-*` (4×) blijven compact — bewuste, vastgelegde
  afwijking voor dense tabellen en toolbars. Niet aanraken.

**`input.tsx`**
- `bg-transparent` → `bg-muted focus-visible:bg-background`; de `dark:bg-input/30`-hacks
  vervallen (muted dekt dark correct en landt exact op §14 Input Bg).
- `h-8 px-2.5 py-1` → `h-11 px-3.5` (44px, 12×14px) — gekoppeld aan **V2**.
- Focus: `focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/10`
  (kit-ring is `rgba(45,90,140,.1)`, niet de huidige `/50`). Rand 1px of 2px → **V11**.
- Error via `aria-invalid` kleurt vanzelf naar `#D84C4C`.
- Tekstgrootte → **V10**.

**`card.tsx`**
- `ring-1 ring-foreground/10` → `ring-1 ring-border` + `shadow-[0_2px_8px_rgba(0,0,0,0.06)]` (§8).
- `[--card-spacing:--spacing(4)]` (16px) → `--spacing(5)` (20px); `data-[size=sm]` blijft 16px —
  dat ís de kit-Data-Card-maat. Voeg `data-[size=sm]:rounded-lg` toe voor KPI-radius 6px.
- Hover-schaduw alleen op klikbare kaarten, niet generiek (kit: hover zonder scale).
- Radius: niets doen, volgt uit §4.

**`dialog.tsx`** — `duration-100` → `data-open:duration-200 data-closed:duration-150` (§12; de
bestaande `zoom-in-95` matcht kits 0.95→1.0 al). `p-4` → `p-5`, met de negatieve
footer-marges synchroon mee. Radius volgt uit §4. Kit zwijgt over modals — in het commitbericht
benoemen.

**`badge.tsx`** — niet aanraken tot **V7**. Kleuren volgen vanzelf.

**`table.tsx`** — geen wijziging. Volledig token-gedreven; de kit heeft geen tabel-spec.
Eventuele `text-[13px]` op `TableHead` hangt aan **V1** en **V15**.

**Zonder edit meegekleurd via tokens:** alle 115 componenten/pages, met name de 37
button-importeurs, 24 card-, 16 input-, 16 table-importeurs, `components/nav-link.tsx` en
`components/data/data-cards.tsx`.

**Mét edit, aparte stap:** de 26 bestanden met hardgecodeerde palet-utilities →
`success`/`warning`/`destructive`. De kit geeft géén tint-recept voor de zachte achtergrondjes
(nu `bg-amber-100 text-amber-800`) → **V13**. Ook de drie ad-hoc textareas
(`bg-background border-input`) meenemen naar `bg-muted`. `components/org/org-list.tsx:148` heeft
een off-brand default-accent `#6b7280` voor per-org-branding → **V16**.

---

## 6. Openstaande vragen

### Beantwoord door Timo, 2026-07-30 — de vier blockers zijn dicht

| # | Besluit | Consequentie |
|---|---|---|
| **V1** | `--muted-foreground` blijft **kit-letterlijk `#8E9BA8`**. Instructie: de kit is leidend. | ⚠ **De MD spreekt zichzelf hier tegen** — §3 schrijft de kleur voor, §11 eist 4.5:1, en 2,8:1 haalt zelfs de 3:1-drempel voor grote tekst niet. Er is geen lezing waarin beide kloppen. De app gaat dus bewust live met secundaire tekst onder AA, op vrijwel elke pagina. Vastgelegd als bekende afwijking voor Eduard (DESIGN.md O8), niet als vergissing. |
| **V2** | 44px geldt voor **`default`, `lg` en formuliervelden**. `sm` (56×), `xs` (2×) en `icon-*` (4×) blijven compact. | Bewuste afwijking van §7 voor dense tabellen en toolbars. Vastgelegd in DESIGN.md O9 zodat een latere bouwer ze niet "corrigeert". |
| **V3** | Primaire CTA in dark = **wit vlak, navy tekst**. | Kit-conform (§3: wit is voor CTA's op donker), maximaal contrast, geen verzonnen kleur. |
| **V4** | Focus-ring in dark = **teal `#1BA89A`**. | 5,4:1 op navy, ruim boven de eis. Light blijft blauw `#2D5A8C`; je ziet nooit beide standen tegelijk. |

Stap 1 en 3 van §8 zijn hiermee ontgrendeld. De vragen hieronder blokkeren de bouw niet, maar
**geen ervan mag door een bouwer zelf worden ingevuld** — ook niet "even snel" tijdens een commit.

### Overige

| # | Vraag |
|---|---|
| V5 | Fouttekst `#D84C4C` op wit = **4,15:1**, net onder AA voor 13px. Accepteren of terug naar Eduard? |
| V6 | Teal faalt AA als tekstkleur (wit-op-teal 2,95:1; teal-op-wit ~3:1). Teal beperken tot iconen, randen en grote elementen? |
| V7 | Badges zijn nu pills. De kit verbiedt pills voor knóppen (§19-1) en zwijgt over badges. Pill houden of naar 6px? |
| V8 | Fontroute — zie §7. |
| V9 | Mono — zie §7. |
| V10 | Inputtekst mobiel 16px houden (voorkomt iOS-autozoom) of kit-letterlijk 15px? |
| V11 | Focus: kit-exact `outline 2px / offset 2px` overal, of shadcn's ring-halo in kit-blauw als bewuste afwijking? En op inputs: letterlijk 2px rand (verschuift 1px) of 1px rand + 3px ring? |
| V12 | Akkoord dat kit-secundair de `outline`-variant wordt en `--secondary` een neutraal grijs vlak blijft (§3.1)? |
| V13 | Statusvlakjes: de kit geeft alleen volle kleuren. Recept `bg-warning/10 text-warning` (contrastrisico) of tint-paren aan Eduard vragen? |
| V14 | Dossier-statuskleuren groen/geel/blauw/rood/paars: domeinsemantiek buiten de huisstijl, of moeten groen→teal en geel→oranje mee? Blauw en paars hebben geen kit-equivalent. |
| V15 | `--text-xs` optillen naar 13px (kit-minimum) — akkoord met het effect op dense tabellen? |
| V16 | Per-org branding-accent `#6b7280` in `org-list.tsx` buiten huisstijl-scope laten? |

---

## 7. De twee punten waarop de agents verschillen

Op alles hierboven kwamen beide plannen onafhankelijk op hetzelfde uit. Hier niet.

### V8 — fontroute

| | `next/font/google` | lokale woff2 |
|---|---|---|
| AVG runtime | ✓ self-hosted, browser praat nooit met Google | ✓ self-hosted |
| Build-fetch naar Google | per niet-gecachte build | nooit |
| Bestanden nodig in repo | nee | ja — en die zijn er nog niet |
| Font zichtbaar in screenshot-tests | nee | ja, met een test-`@font-face` |
| Nu uitvoerbaar zonder te downloaden | ✓ | ✗ |

Plan B koos lokale woff2 (hermetische build, guardrail volledig gerespecteerd, tests tonen
eindelijk het echte font). Plan A koos `next/font/google` nu en lokaal later, met één argument
dat B niet had: **de status quo doet dit al** — Geist en Geist_Mono komen vandaag via exact
dezelfde route binnen. Geist→Inter verandert de netwerkhouding met nul.

**Aanbeveling: A's gefaseerde route.** Nu Inter via `next/font/google` (direct uitvoerbaar,
AVG schoon, geen regressie), en migreren naar lokale woff2 zodra Eduard levert (kit §18 schrijft
woff2-levering voor). B's testargument is het beste argument om die migratie niet te vergeten:
zolang het font via `next/font` loopt, blijven de screenshots fontloos. Jouw besluit.

### V9 — mono

`Geist_Mono` vervalt. Beide agents stellen vast dat **SF Mono juridisch geen optie is** voor
web (Apple-licentie, niet herdistribueerbaar), ook al noemt de kit hem.

- Plan B: systeemstack `ui-monospace, "SF Mono", "JetBrains Mono", monospace` — nul
  fontbestanden, SF Mono gratis op macOS, elders een nette terugval.
- Plan A: JetBrains Mono (SIL OFL) via dezelfde route als Inter — overal identiek.

Mono wordt op 4 plekken gebruikt (`import-markdown.tsx`, `add-spec-line-form.tsx`,
`brand-message-block.tsx`, `app/projects/[id]/page.tsx`).

**Aanbeveling: de systeemstack.** Vier gebruiksplekken rechtvaardigen geen tweede
fontdownload, en de kit noemt SF Mono expliciet als eerste keus — die krijg je zo gratis. Wil je
pixel-identieke mono op elk OS, dan JetBrains Mono. Jouw besluit.

---

## 8. Volgorde

Elke stap is één kleine commit, `bun vitest run` groen, en de PNG's **bekeken** vóór de volgende
stap. Pushen uitsluitend via `bash scripts/safe-push.sh <sha>` — elke push naar main deployt
naar productie.

| # | Stap | Gate |
|---|---|---|
| 0 | **Specimen-test eerst.** Nieuw `components/huisstijl.test.tsx`: rendert via `renderServer` één stylesheet-pagina (alle button-varianten en -maten, input default/focus/invalid/disabled, Card default+sm, Badge-varianten, tabelfragment, dialog-content), screenshots light/dark × 375×812 en 1280×800 volgens het patroon van `site-nav.test.tsx`. Plus white-box-assertions op computed styles (`getPropertyValue('--primary')`, hoogte `44px`, radius `6px`). Draai hem vóór elke wijziging: dat zijn de before-beelden. | — |
| 1 | **Token-flip** in `app/globals.css`: §3 light + dark + radius-schaal + nieuwe tokens. Nul componentwijzigingen, app blijft werken. Volledige testrun, alle 27 screenshot-testbestanden regenereren en beoordelen — goedkoopste plek om tokenfouten te vangen. | ✅ vrij (V1/V3/V4 besloten) |
| 2 | **Fonts**: `app/layout.tsx` + de `--font-mono`-regel in globals.css. Aparte commit, los revertbaar. Screenshots veranderen niet (zie §1-3) — typografie handmatig checken in `bun dev`. | V8, V9 |
| 3 | **`button.tsx` + `input.tsx`** (geometrie, gewichten, states) + specimen-assertions bijwerken. Hier wordt 44px zichtbaar; alle schermscreenshots opnieuw beoordelen op kapotte dense layouts. | ✅ vrij (V2 besloten) · V10, V11 |
| 4 | **`card.tsx` + `dialog.tsx`** (+ `badge.tsx` zodra V7 er is). | V7 |
| 5 | **Sweep**: ad-hoc textareas, de 46 `rounded-*`-bestanden nalopen op de nieuwe schaal, `grep` op resterende hardgecodeerde hex/palet-utilities. | — |
| 6 | **Statuskleuren-migratie** (26 bestanden, 163 voorkomens → semantic tokens). Volledig gescheiden; mag doorschuiven zonder dat 1–5 erop wachten. | V13, V14 |

Stappen 1→3→4 zijn volgordelijk (tokens eerst, anders beoordeel je componentwijzigingen tegen
oude kleuren). Stap 2 kan er op elk moment tussen.

---

## 9. Tradeoffs, en wat we niet doen

**Makkelijkste weg vs. beste weg.** De makkelijkste weg is alléén stap 1: de app oogt in een
middag LumenLogic, niets breekt, 80% van het merkgevoel voor 5% van het werk. Maar dan blijft de
kit onwaar op precies de punten waar hij het hardst is: 44px-knoppen, 20px-kaartpadding,
inputvlakken, focus-gedrag. De beste weg neemt de primitives mee. Ze wijken af op drie punten:
knophoogte, inputhoogte, focus-mechaniek. Vallen V2/V11 negatief uit, dan is "alleen stap 1 + 2"
een schoon tussenstation in plaats van een half karwei.

**Het WCAG-mijnenveld zit in de kit zelf.** Vier voorgeschreven combinaties falen de eis die de
kit zelf stelt: `#8E9BA8` op wit 2,8:1 · `#D84C4C` op wit 4,15:1 · wit op teal 2,95:1 · blauwe
ring op dark-navy 2,25:1. (Nagerekend, niet overgenomen.) Twee daarvan zijn met V1 en V4
afgehandeld — de dark-ring wordt teal (opgelost), en `#8E9BA8` blijft staan als **bewust
geaccepteerde afwijking**. V5 en V6 liggen nog open. Dit is een kit-probleem, geen
implementatieprobleem: alleen Eduard kan het bij de bron repareren.

**Wat we expliciet niet doen:** een `tailwind.config.js` introduceren (CSS-first is de
Tailwind-4-weg en werkt) · tokens hernoemen of het `@theme inline`-blok herstructureren ·
de badge stilzwijgend ont-pillen · kleuren afleiden die de kit niet geeft (hooguit `color-mix`
op kit-kleuren, en dan met sign-off) · de token-flip en componentgeometrie in één commit
(onontwarbaar in screenshots) · violet/magenta in CSS zetten · het brand-kit-MD aanraken ·
wachten op Eduards woff2's voordat er iets kan landen.
