# Sprint 1.5 · Fase 2 — het gekozen plan

Twee planagents hebben onafhankelijk gewerkt (A en B). Hieronder per beslispunt de keuze, met
het argument dat de doorslag gaf en de reden waarom het verliezende voorstel afvalt. Dit
document is bindend voor fase 3.

---

## 1. Schermindeling — A wint, met één toevoeging van B

**Gekozen:**

| Wat | Waar |
|---|---|
| Lijst | `/admin/brands` — `BrandsTierBlock` blijft, merknaam wordt link naar de detailroute, levensfase als **badge** (geen extra kolom, geen tweede select in de rij) |
| Filteren | Nieuwe filterbalk boven de tabel: `?q=` (naam/merkcode) en `?phase=`, server-side, gewone `<form method="get">` |
| Aanmaken | `/admin/brands/new` |
| Bewerken + levensfase + verwijderen | `/admin/brands/[brandId]` |

**Waarom de detailroute.** Beide agents kwamen hier onafhankelijk op uit, om dezelfde gemeten
reden: de verwijderimpact kost acht subquery's per merk. Inline betekent 437 × 8 per pageview
voor een antwoord dat vandaag voor alle 437 rijen hetzelfde is ("nee"). Een detailroute maakt
het tellen per definitie lazy. Het is bovendien exact het patroon van
`/data/brand-relations/[brandId]` — zelfde tabel, zelfde soort scherm.

**Waarom `/new` en niet B's inline `<details>` op de indexpagina.** B's voorstel is aantrekkelijk
(geen navigatie, gratis open/dicht-state), maar het breekt op de dubbelcheck zonder JavaScript:
na de POST rendert de pagina opnieuw en een `<details>` staat dan **dicht**. De waarschuwing die
de gebruiker bewust moet zien, is dan onzichtbaar. Op een eigen route bestaat dat probleem niet.

**Waarom de levensfase niet als select in de tabelrij (B's voorstel).** B's argument — "failliet
markeren is een handeling van één klik uit de werklijst" — is goed, maar de rij draagt al een
tier-select, en G3 noemt de 375px-overloop expliciet als reden om dit scherm níét te verzwaren.
De filterbalk maakt het merk vinden goedkoop, en de één-klik-knop staat waar hij ertoe doet: in
het verwijderblok, als aangeboden alternatief (beslispunt 3). De badge in de lijst maakt de fase
wél zichtbaar.

**Waarom de filterbalk er tóch bij komt (B's toevoeging, A had hem niet).** G1's hele klacht is
dat je op de status niet kunt filteren. Een levensfase die je niet kunt filteren lost dat niet
op — de filterbalk is de uitbetaling van G1, niet extra scope.

---

## 2. Dubbelcheck — A wint

Beide plannen kwamen op hetzelfde skelet uit: `useActionState`, een discriminated-union-state,
waarschuwing met link naar het bestaande merk, ingevulde waarden komen terug via `state.values`,
tweede submit met een bevestigingssleutel, en de bewuste keuze wordt in de event-payload
vastgelegd. Dat skelet staat vast.

**Het verschil: de bevestigingssleutel.** B gebruikt `confirmDuplicate=1`. A gebruikt een
`confirmToken` = de gesorteerde id's van de gevónden dubbelen, gejoind.

**A wint.** Wijzig je de naam tussen waarschuwing en bevestiging, dan verandert de match-set,
verandert de token, en krijg je een *verse* waarschuwing in plaats van een blinde schrijfactie op
een vinkje van drie seconden geleden. Dat is wat "bewust doorgaan" moet betekenen. Kosten: één
regel.

**Datastroom, bindend:**

1. `createBrandAction(prev, formData)` → `requireSession()`, velden trimmen, `name` verplicht.
2. `findBrandDuplicates(db, { name, brandCode, excludeId? })` — één query,
   `lower(name) = lower($1) OR (brand_code is not null and lower(brand_code) = lower($2))`.
   **Exact, niet fuzzy, niet via `brandKeyOf`, niet via slug.**
3. `duplicateToken(matches)` = gesorteerde id's, gejoind.
4. Matches én `formData.confirmToken !== token` → **niets geschreven**, return
   `{ status: "duplicate", token, matches, values }`.
5. Formulier toont per match een `<a href="/admin/brands/{id}">`, de zin dat dit écht drie merken
   kunnen zijn, hidden `confirmToken` gevuld, knop wordt "Yes, create anyway".
6. Tweede submit → token komt overeen → insert, event met `duplicateOf: string[]`,
   `revalidatePath`, `redirect` naar het verse merk. Succes is een scherm, geen melding.

**Kritiek implementatiedetail (A's vondst):** de state moet `values` meedragen en het formulier
moet `defaultValue={state.values?.x ?? ...}` gebruiken. Vergeet je dat, dan is het formulier na de
waarschuwing leeg zodra JS uit staat. **Dat krijgt een eigen test.**

---

## 3. Verwijderblokkade — convergent, met één detail van B en één van A

Beide plannen waren op dit punt vrijwel identiek. Bindend:

- **Tellen gebeurt alleen op `/admin/brands/[brandId]`**, in één SELECT met acht scalaire
  subquery's op geïndexeerde `brand_id`-kolommen. De lijst telt nooit. Geen kolom "verwijderbaar".
- **Twee groepen, want ze betekenen iets anders:**
  - *blokkeert* — `products`, `price_lists`, `enrichment_runs`, `leads`
  - *verdwijnt stil mee* — `brand_relations` (**bovenaan**: het outreach-record uit 1.4 met
    status, contactpersoon en notities), `brand_aliases`, `brand_field_visibility`, `brand_uploads`
- **Bij ≥1 blocker is er géén verwijderknop** — afwezig, niet disabled. Een uitgegrijsde knop
  leert niets en nodigt uit tot klikken.
- **De levensfase staat als uitweg in hetzelfde blok**, één `<form action={setBrandLifecycleAction}>`.
  G4 letterlijk: blokkeren én de uitweg aanbieden, op dezelfde plek.
- **Bij nul blockers**: tweefasige delete via `useActionState` — eerste klik toont de
  cascade-lijst uitgeschreven, tweede klik voert uit. Eén database is dev én prod.
- **Hertellen vlak vóór de DELETE**; `deleteBrand` geeft `{ ok: false, impact }` terug in plaats
  van te gooien.

**Van B overgenomen:** toon de prijslijst **bij naam met het aantal prijsregels** —
"1 price list — Brutoprijslijst Tronconi (0 price rows)". Zonder dat leest iemand die weet dat
het merk leeg is "1 prijslijst" als een fout en gaat hij zoeken naar iets wat er niet is. Dit is
bij 405 van de 437 merken de énige blocker, dus dit is het normale geval.

**Van A overgenomen:** vang een PG-constraintfout tóch op als laatste redmiddel, tel opnieuw en
toon hetzelfde panel. B rekende erop dat de fout niet kán optreden; op een database die tegelijk
dev en productie is, is een vangnet goedkoper dan gelijk hebben.

---

## 4. De levensfase-enum — B wint

```
pgEnum-naam : brand_lifecycle
kolom       : brands.lifecycle   (Drizzle: brandLifecycle("lifecycle"))
waarden     : 'actief' | 'slapend' | 'bestaat_niet_meer'
default     : 'actief', NOT NULL, kolomdefault, GEEN backfill
```

A stelde twee waarden voor (`actief` / `vervallen`) met het argument dat alle 18 geannoteerde
merken aan dezelfde kant van de enige lijn vallen die de werklijst nodig heeft.

**B wint, en dit is het argument dat de doorslag gaf.** In de 18 namen staan twee verschillende
zinnen, en ik heb ze in de meting geteld:

- **een feit over de wereld** — `Tronconi (BESTAAT NIET MEER)`, `Luxit (Is failliet)`,
  `Martini (FAILLIET)`, `DAB BESTAAT NIET MEER`, `Modiss`, `Lucente`, `Produzione Privata`,
  `Disegnoluce`, plus de twee `=`-gevallen (`Murano Due = Leucos geworden`) → **`bestaat_niet_meer`**
- **een besluit van Brink** — `Bernd Beisse (NIET MEER GEBRUIKEN)`, `Itre (niet meer gebruiken)`,
  `Tre ci Luce (niet meer gebruiken)` → **`slapend`**

Met alleen `vervallen` moet Timo bij die laatste drie een onwaarheid vastleggen: Itre bestaat
mogelijk gewoon nog, Brink gebruikt het alleen niet meer. Hij zou de annotatie dus in de naam
laten staan — en dan is G1 voor die rijen niet opgelost. Een enum die 3 van de 18 gevallen niet
kan absorberen zonder te liegen, is te klein.

`slapend` is bovendien vrij terug te draaien zonder dat er ooit iets onwaars in de database heeft
gestaan. Dat maakt de knop veilig te gebruiken, en dat is bij deze gebruiker het punt.

**Wat er niet in zit:**
- Geen `failliet`. Dat is een *reden*, geen fase — die hoort in `description_nl`. (A's argument,
  overgenomen.)
- Geen `samengevoegd` / `opgegaan_in`. Zonder de opvolger-kolom is die waarde betekenisloos
  ("opgegaan in wat?"), en de opvolger-verwijzing is expliciet buiten scope. De twee `=`-merken
  krijgen `bestaat_niet_meer`; de bestemming is de opvolgtaak.
- **De 7 rijen met haakjes of ` / ` als naamváriant** (`Boom / BEGA`, `Philips (lichtbronnen)`)
  vragen helemaal niet om de enum — dat zijn aliassen, en `brand_aliases` is daarvoor. Niet
  onze sprint.

**Waarom geen backfill nodig is.** `ADD COLUMN … NOT NULL DEFAULT 'actief'` is in PG11+ een
metadata-only operatie: geen table rewrite, geen `UPDATE`, `updated_at` blijft ongemoeid. De
fingerprint uit fase 1 (`437 rijen, md5 f4deb1efbea17090df1ff94d4b667cff`) dekt id, naam, code,
slug, land, tier, omschrijving, website en updated_at — `lifecycle` zit er niet in en de hash
blijft dus identiek. Dat is DoD 7 in één query, vóór en ná.

'actief' is de juiste default: 405 van de 437 merken *zijn* de werklijst. De 18 die het mis
hebben zet Timo met de hand goed — met precies de knop die deze sprint bouwt (G2).

---

## 5. Waar de code landt — A's structuur, B's additieve lijstquery

- **`lib/repo/brands.ts` (nieuw)** — alle merk-CRUD + de blokkeerteller. Niet in
  `lib/repo/admin.ts`: dat bestand gaat over disclosure en uploads, en de teller moet
  `products`, `price_lists`, `enrichment_runs` en `leads` importeren. Precedent:
  `lib/repo/brand-relations.ts` staat ook los.
- **`listBrandsWithTier` blijft in `lib/repo/admin.ts`** en krijgt `brandCode` en `lifecycle`
  additief mee in dezelfde select — nul extra queries, geen bestaande aanroeper breekt. Plus een
  optionele `opts?: { q?: string; lifecycle?: BrandLifecycle }` voor de filterbalk.
- **`app/admin/brands/actions.ts` (nieuw)** — precedent `app/data/brand-relations/actions.ts`.
  `app/admin/actions.ts` blijft van tier en uploads.
- **Eigen testbestanden**, niet toevoegen aan `components/admin/admin.test.tsx` — dat zou de
  vier bestaande PNG's invalideren.

## 6. Twee dingen die bewust níét meebewegen

- **`slug` wordt bij hernoemen niet herberekend.** Slug is niet uniek, is nergens een route
  (routes gaan op `brandId`) en heeft één lezer buiten de import. Stil laten verschuiven wijzigt
  een waarde die niemand ziet. Beide agents kwamen hier onafhankelijk op uit. Melden in
  `HANDOVER.md`.
- **`brandSlugOf` is geen normalisatiemechanisme.** Het vult een NOT NULL-kolom zonder default
  bij het aanmaken. Het wordt nooit gebruikt voor de dubbelcheck of voor matching — `brandKeyOf`
  blijft daar de enige.

---

## Contract tussen de twee bouwagents (ligt vóór de start vast)

| Wat | Waarde |
|---|---|
| Enum-type | `brand_lifecycle` |
| Enum-waarden | `actief`, `slapend`, `bestaat_niet_meer` |
| Kolom | `brands.lifecycle`, NOT NULL, default `actief` |
| Drizzle-export | `brandLifecycle` (pgEnum), type `BrandLifecycle` |
| Migratie | `db/migrations/0013_merk_levensfase.sql`, journal `idx: 13` |
| Event-acties | `brand_created`, `brand_updated`, `brand_lifecycle_changed`, `brand_deleted` — alle `entity: "brand"` |
| Server actions | `createBrandAction`, `updateBrandAction`, `setBrandLifecycleAction`, `deleteBrandAction` in `app/admin/brands/actions.ts` |
| Repo | `lib/repo/brands.ts` |
| Routes | `/admin/brands/new`, `/admin/brands/[brandId]` |
| Componenten | `components/admin/brand-form.tsx`, `brand-delete-block.tsx`, `brand-filter-bar.tsx` |

### Event-payloads

| Actie | Payload |
|---|---|
| `brand_created` | `{ name, slug, brandCode, lifecycle, duplicateOf: string[] }` |
| `brand_updated` | `{ changed: string[], duplicateOf: string[] }` |
| `brand_lifecycle_changed` | `{ from, to }` |
| `brand_deleted` | `{ name, slug, brandCode, cascaded: {...} }` — naam/code in de payload, want `entityId` wijst na de delete naar een rij die niet meer bestaat |

Eén save kan **twee** events geven (`brand_updated` én `brand_lifecycle_changed`) — bewust,
zodat "wie zette welk merk op vervallen" leesbaar is zonder door veldlijsten te grepen.
