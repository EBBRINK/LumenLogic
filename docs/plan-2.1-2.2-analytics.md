# Plan 2.1 + 2.2 — de Analytics-pagina op echte events

*Geschreven 30 jul 2026, na een meting op de live database. Fase 1 (vragen) is met Timo
afgerond; dit is het bouwplan dat vóór de code ter goedkeuring voorligt.*

Twee sprintitems, één pagina: **2.1 = wat er intern gestuurd moet worden**, **2.2 = waar
Brink omzet laat liggen** (besluit G22). Ze delen dezelfde eventlaag en dezelfde querylaag,
dus ze worden samen gebouwd en op één pagina getoond, in gescheiden blokken.

---

## 1. De meting waar dit plan op staat

Gemeten 30 jul 2026 op de productie-database. De cijfers van 22 jul kloppen nog op de
eventtellingen; op de tabellen niet meer.

| Grootheid | 22 jul | 30 jul (gemeten) |
|---|---|---|
| events totaal | 1.427 | **1.428** — 2 t/m 21 jul, 9 actieve dagen, 23 actors, 41 actietypes |
| `product_considered` | 680 | **680** — 181 producten; 509 "aantoonbaar", 171 "onvolledig" |
| `matched_status` | 298 | **298** — blauw 133 · rood 64 · groen 57 · open 22 · geel 11 · paars 11 |
| `search` | 84 | **84** — 9 ZZTEST-ruis + 5 lege query's; **11 van 26 unieke zoekopdrachten leverden niets op** |
| `brand_load_requested` | — | **133** events over 40 merken |
| blauwe wachtrij | 40 | **40** merken, `frequency`-som **133** |
| spec-regels | 204 | **204** |
| dossiers | 16 | **13** rijen (16 `dossier_created`-events; 3 rijen verwijderd) |
| offertes | 1 | **1** (+ 3 offerteregels) |
| organisaties / memberships | 0 / 0 | **0 / 0** |
| `xis_exports` | — | **0** |
| producten / merken | — | **211.317** producten · **438** merken, waarvan **33 met producten** |

**Laatste event: 21 jul 14:23.** De laag staat negen dagen stil. Dit is testdata van onze
eigen dagen, geen gebruikersgedrag — de pagina zegt dat zelf (zie §3).

---

## 2. Wat wél en niet kan — per tegel gemeten

### Uit de 2.0a-placeholderlijst

| Tegel | Verdict | Bewijs |
|---|---|---|
| Most searched | **kan** | 84 events, 75 na ruisfilter |
| Loading signal | **kan, sterkste** | 40 merken in de wachtrij, vraaggewicht 133 |
| Projects created | **dun maar echt** | 13 dossiers, 1 offerte, alles `tender/concept` |
| Becoming the expert | **geschrapt** | Geen query, geen definitie, nergens in de docs. Besluit Timo 30 jul: schrappen — een tegel zonder afgesproken betekenis vult zichzelf later met wat toevallig meetbaar was. |
| Fixtures → XIS | **kan niet** | `xis_exports` = 0 rijen, geen koppeling, keys bij Lynx |
| XIS-recognised projects | **kan niet** | idem |
| 5× To be determined | **geschrapt** | Ingevuld door de blokken hieronder |

### Uit het sprintplan

| Belofte | Verdict | Bewijs |
|---|---|---|
| Top-overwogen producten | **kan** | 680 events over 181 producten |
| Datagaten & dekking | **kan, rijk** | 88/204 regels zonder aantal · 110 zonder kelvin · 139 zonder watt · 146 zonder lumen · 18 zonder merk |
| Afwijzingsredenen-top-10 | **niet zoals bedoeld** | `no_match_reason` is **0 van de 204** gevuld · `spec_line_no_match` heeft 0 events · de `matched_status`-payload draagt alleen `status`/`provable`/`incomplete` |

**Besluit Timo 30 jul:** de afwijzingsredenen-tegel wordt gebouwd uit de **`deviations`-jsonb**
(gevuld op 200 van de 204 regels): veld + oordeel, dus waaróp de match afketste. Volumes zijn
klein — grootste cel is kelvin/groen met 22 — en dat toont de tegel eerlijk.

---

## 3. De tegels die we bouwen

Bovenaan de pagina **één eerlijke band** (besluit Timo 30 jul):

> Test period 2–21 Jul 2026 · 1,428 events · 23 actors · our own test data, not user behaviour

Daaronder drie blokken. Elke tegel heeft een expliciete lege tak: **geen data = "No data yet"**
(besluit 4), nooit een lege of brekende widget, nooit stilzwijgend weglaten.

### Blok A — 2.1 · Wat loopt goed, wat ontbreekt

1. **Most considered products** — `product_considered` (680) ⨝ `products`, gesplitst naar
   `payload->>'list'` (aantoonbaar / onvolledig). Merk + naam + aantal.
2. **Matcher status split** — `matched_status` (298), zes statussen. Kleur uit de kit én een
   label, want kleur mag nooit het enige onderscheid zijn (DESIGN.md §7).
3. **Where matches break down** — `deviations`-jsonb: veld × oordeel, top 10. Dit is de
   vervanger van de afwijzingsredenen-tegel.
4. **Gaps in spec lines** — 204 regels: ontbrekend aantal, kelvin, watt, lumen, merk.
5. **Queries without results** — 11 van 26 unieke zoekopdrachten, ZZTEST en lege query's eruit.
   Ontdubbeld op querytekst; een zoekopdracht telt pas als mislukt als hij *nooit* iets opleverde.

   *Correctie 30 jul (tweede verificatie):* dit stond eerst als "25 van 75". Die meting trok
   alleen de 9 ZZTEST-zoekacties af en liet 5 lege query's staan; ruw is het 24 van 71.
   Ontdubbeld — wat dit plan altijd al beloofde — is het 11 van 26.

### Blok B — 2.2 · Waar omzet blijft liggen

6. **Requested brands not in the catalogue** — `spec_lines.brand_text` zonder producten in de
   catalogus: Trilux 9 · ETAP 8 · BEGA 8 · NORKA 5 · Philips 4 · Zumtobel 3 · ewo 3. De
   inkoop- én outreachlijst in cijfers.
7. **Brand load queue by demand** — 40 merken, gewogen op `frequency` (BEGA 16 · ETAP 16 ·
   Trilux 16 · Philips 8).
8. **Unmet product demand** — zoekopdrachten met 0 resultaten als productvraag:
   `INFINITE PRO`, `i40`, `ORIONNOVA`, `PHANTOM DELUXE`.

### Blok C — klein en eerlijk

9. **Projects & quotes** — 13 dossiers, 1 offerte, allemaal `tender/concept`. Expliciet als
   testperiode gelabeld; geen funnel, want die is er niet (week 3).

---

## 4. Architectuur

### Wat onaangeroerd blijft

- `lib/repo/analytics.ts` (`getAnalytics`) — **byte-stabiel**, guardrail 1 uit HANDOVER.md.
- `components/analytics-view.tsx` — **byte-stabiel**; nog gedekt door
  `components/dossier/run3-screens.test.tsx`.
- `lib/repo/events.ts` — het schrijfpad van ijzeren regel 5 blijft heel; we lezen alleen.

### Waarom een nieuwe querymodule en niet een uitbreiding van `getAnalytics`

`getAnalytics` mag niet gewijzigd worden (byte-stabiel), dus uitbreiden kan niet. Meegenomen
wordt wél zijn **vorm**: de `rows<T>()`-helper en de uuid-cast-guard die voorkomt dat één
afwijkend event de pagina breekt. Twee van zijn vier queries zijn bovendien niet meer bruikbaar
voor deze pagina: `topMatched` staat op `action = 'match'` (9 events, alle van 1 jul, terwijl
het echte signaal `product_considered` met 680 is) en `recent` is in 2.0a naar
`/data/event-log` verhuisd. `topSearches` wordt opnieuw geschreven omdat het ruisfilter en de
org-scope erbij moeten.

### Bestanden

| Bestand | Actie |
|---|---|
| `lib/repo/analytics-tiles.ts` | **nieuw** — `getAnalyticsTiles(db, opts)`, alle negen queries |
| `components/analytics/tile.tsx` | **nieuw** — kaart met verplichte lege tak ("No data yet") |
| `components/analytics/test-period-band.tsx` | **nieuw** — de eerlijke band bovenaan |
| `components/analytics/analytics-tiles.tsx` | **nieuw** — de drie blokken |
| `app/analytics/page.tsx` | **wijzigen** — placeholders eruit, echte tegels erin |
| `lib/repo/analytics-tiles.test.ts` | **nieuw** — PGlite, inclusief lege-database-tak per tegel |
| `components/analytics/analytics-tiles.test.tsx` | **nieuw** — RSC, light/dark × mobile/desktop |

Blijft af van alles wat sessie `2.0b-vervolg` omzet: `components/data/`, `components/dossier/`,
`components/admin/`, `components/catalog-search.tsx`, `components/settings/llm-budget-block.tsx`.

### Signatuur

```ts
export type AnalyticsTilesOptions = {
  /** null = intern, alles. Een orgId scopet via spec_line → dossier → org. */
  orgId?: string | null;
  /** Besluit 12: merk-cijfers alleen bij >= N events/week per product. 0 = intern, geen grens. */
  minEventsPerWeek?: number;
};

export async function getAnalyticsTiles(
  db: AppDb,
  opts: AnalyticsTilesOptions = {},
): Promise<AnalyticsTiles>;
```

**Org-scoping, gemeten.** `events` heeft geen `org_id`; het pad is
`events.entity_id → spec_lines.id → spec_lines.dossier_id → project_dossiers.org_id`.
`entity_id` is gevuld op 680/680 `product_considered`, 298/298 `matched_status`, 133/133
`brand_load_requested` en 65/84 `search`. Twee gemeten consequenties:

1. Alle 13 dossiers hebben `org_id = NULL`. Met een `orgId` levert elke query vandaag dus 0 —
   de parameter staat klaar voor week 3, hij doet nu niets. Dat is de bedoeling.
2. De join verliest events die naar verwijderde spec-regels wijzen (`product_considered`
   565 van 680). **Intern (`orgId = null`) joinen we daarom niet** en telt de volle 680.

**Anonimiseringsgrens (besluit 12).** `minEventsPerWeek` staat in de querylaag, default 0
(intern). Gemeten bij de grens van 5: per week haalt maar **8–11 van de ~90** overwogen
producten hem. Deze sprint zit er geen merkaccount op de pagina (0 organisaties), dus de grens
is niet zichtbaar in de UI — week 3 hoeft hem alleen aan te zetten.

### IJzeren regels in deze module

- **Regel 2** — `analytics-tiles.ts` importeert niets uit de matcher en raakt geen `prices`,
  `price_lists` of marge. Geld staat náást de matcher, nooit erin.
- **Regel 3** — deze regel geldt hier *niet*: analytics telt gedrag uit het verleden en biedt
  niets aan. De tegels lezen daarom `products`, niet `visible_products`.

  *Correctie 30 jul (tweede verificatie):* dit stond eerst omgekeerd. Doorslaggevend is een
  gemeten neveneffect: alle 181 overwogen producten hangen aan prijslijsten die op 31 dec 2026
  verlopen. Via `visible_products` zou "Most considered products" op 1 januari 2027 van 680
  events naar "No data yet" springen zonder dat er één rij verandert — de geschiedenis
  herschrijft zichzelf met de kalender. Regel 3 beschermt zoekresultaten en calculaties tegen
  onbekende prijzen; een tegel die telt wat er ooit overwogen is, noemt geen prijs.
- **Regel 5** — puur leespad; het schrijfpad wordt niet aangeraakt.
- **Besluit 4** — elke tegel heeft een lege tak; de UI-component dwingt dat af via een
  verplichte `emptyText`-prop.
- **Uuid-guard** — elke `::uuid`-cast krijgt de regex-guard uit `getAnalytics`, zodat één
  afwijkende payload de pagina niet breekt (staat als bufferwerk in het sprintplan).

### Vormgeving

Tokens uit `globals.css`, geen hardgecodeerde Tailwind-kleuren. Statuskleuren volgen kit §3 via
de bestaande tokens: groen → `--success` (#1BA89A) · rood → `--destructive` (#D84C4C) · geel →
`--warning` (#FF9500) · blauw → `--chart-1` (#2D5A8C) · open/paars → `--muted-foreground`
(#8E9BA8). Kaarten volgen DESIGN.md §6 "Data / KPI". Kleur nooit als enig onderscheid (§7).

---

## 5. Tests

- **`lib/repo/analytics-tiles.test.ts`** (PGlite) — per tegel: een gevuld geval én de lege
  database. Plus: de uuid-guard slikt een kapotte payload, en `orgId` scopet aantoonbaar.
- **`components/analytics/analytics-tiles.test.tsx`** (RSC, witbox) — light/dark ×
  mobile/desktop met screenshots, plus gerichte asserts: de testperiode-band staat er, een
  tegel zonder data toont "No data yet", en de statuskleuren dragen ook een tekstlabel.
- Screenshots worden **zelf bekeken** voordat er "af" gezegd wordt.
- `bun install` in de worktree vóór de suite (anders vallen ~275 db-tests om op een ontbrekende
  PGlite — bekende valkuil, geen codefout).
- `brand-message` / `brand-admin` / `custom-fields` zijn bekend flaky onder belasting: die
  worden geïsoleerd herdraaid voordat er iets regressie heet.

---

## 6. Bevindingen — gemeld, niet gerepareerd

1. **204 spec-regels, 3 met een gekoppeld product.** 96 blauw en 42 groen hebben
   `matched_product_id = NULL`; `spec_line_candidates` heeft 2 van 443 op `chosen`. Status wordt
   gezet zonder dat de koppeling landt.
2. **`no_match_reason` wordt nergens weggeschreven** (0 van 204) terwijl schema en C-14/K-03 het
   beloven. Dit is precies waarom de afwijzingsredenen-tegel uit het sprintplan niet kan.
3. **`brand_text` is vervuild met ruimtenamen** — "Woonkamer" (4), "Vergaderruimte" (4),
   "Toilet" (3), "Raadzaal" (2), "Divers" (7) staan in de merkkolom en dus ook in de blauwe
   wachtrij en in tegel 6.

Tegel 6 en 7 tonen deze vervuiling zichtbaar mee in plaats van hem stil weg te filteren —
filteren zou het probleem verbergen. Dat blijft zo tot bevinding 3 gerepareerd is.

---

## 7. Werkwijze fase 3

Eén hoofdagent verdeelt het werk over bouwagents. Elk stuk werk wordt door een **aparte** agent
gecontroleerd. Vindt de controleur iets, dan gaat die bevinding naar een **tweede verificatie** —
geen bevinding gaat op één mening terug de bouw in. Bevestigde fouten gaan terug naar de
hoofdagent, die ze bij een **andere** bouwagent belegt; niemand herstelt zijn eigen fout.

**Stop vóór de push.** Elke push naar main deployt live; pushen gaat uitsluitend via
`bash scripts/safe-push.sh <sha>`, en pas met Timo's akkoord.
