# Sprint 1.5 — merkbeheer in het systeem zelf

*Zelfvoorzienende briefing. Je hoeft geen enkele eerdere sessie gelezen te hebben.*

## Waarom dit er is

Om in sprint 1.4 een testmerk te maken moest er een constante in `scripts/testmerk-1-4.ts`
worden gewijzigd. Er is geen enkele manier om via de app een merk aan te maken — geverifieerd:
`app/admin/brands/page.tsx` (43 regels) toont alleen disclosure-tier en veldzichtbaarheid, er
staat geen formulier in.

Dat is het hele probleem. **Merken zijn er alleen als de bronimport ze heeft gebracht.**

## Wat je bouwt

Op **Admin · Brands** (`/admin/brands`, "Brands & visibility"):

1. **Merk toevoegen** — formulier met naam, merkcode, land, website, omschrijving, levensfase.
2. **Merk bewerken** — dezelfde velden, op een bestaand merk.
3. **Levensfase zetten** — een merk dat niet meer bestaat hoort niet in de outreach-werklijst.
4. **Merk verwijderen** — alleen als er echt niets aan hangt (zie hieronder).

## De zes besluiten van Timo (20 jul, uit de grill-sessie)

| # | Besluit | Waarom |
|---|---|---|
| G1 | **Levensfase modelleren**, geen kale CRUD | De status van een merk zit nu in de naamtekst ("Tronconi (BESTAAT NIET MEER)"). Daar kun je niet op filteren, en de matcher leest die haakjes mee als merknaam |
| G2 | **De 437 bestaande merken blijven exact zoals ze zijn** | Geen opschoning, geen hernoeming, geen backfill. 1.5 bouwt alleen het vermógen; wat er met de bestaande rommel gebeurt beslist Timo later per merk |
| G3 | **Uitbreiden van Admin · Brands**, geen nieuw portal | Dat scherm gaat al over het merk als *record*. Brand relations gaat over de *relatie*. Die scheiding blijft. Ook praktisch: de hoofdbalk loopt op 375px nu al over |
| G4 | **Verwijderen blokkeert met uitleg**, en biedt de levensfase aan | Eén database is tegelijk dev én productie. Eén misklik met cascade is definitief |
| G5 | **Dubbele naam/code waarschuwt, blokkeert niet** | Flos, Flos Architectural en Flos SOFT Architectural delen code L028 en zijn écht drie merken. Blokkeren zou die onmogelijk maken |
| G6 | **Alleen identiteitsvelden + levensfase** | Korting, betaaltermijn en levertijd komen uit de bronimport. Ze met de hand bewerkbaar maken creëert een tweede waarheid naast de import |

## Gemeten stand (20 jul, live database — niet overschrijven, verifieer zelf)

- **437 merken. 405 daarvan hebben nul producten**; 32 merken dragen alle 211.314 producten.
  Die 405 zijn géén rommel — dat is de outreach-werklijst.
- **Slechts 18 merken hebben een annotatie in de naam**: 9× "bestaat niet meer"/"niet meer
  gebruiken", 4× haakjes, 3× ` / `, 2× `=`. Alle 18 hebben nul producten.
- **19 dubbele merkcodes, 2 dubbele namen, 2 dubbele slugs.** `L062` hoort bij 5 merken:
  `.`, Erea, Lumiance, Philips (lichtbronnen), RZB Lighting.

## Vallen die al geverifieerd zijn — hier niet nog eens in trappen

**1. Je kunt géén unieke index toevoegen.** Er staan 19 dubbele codes en 2 dubbele namen in
productie, en die moeten blijven staan (G2). Een `UNIQUE`-index laat de migratie meteen falen.
De dubbelcheck van G5 hoort dus **in de applicatielaag**, niet in het schema.

**2. `brands.id` heeft geen `defaultRandom()`** (`db/schema.ts:181`). Bij een insert moet je de
uuid zelf genereren. Vergeet je dat, dan faalt de insert op een NOT NULL zonder default.

**3. `slug` en `brand_code` zijn expliciet niet-uniek** — dat staat als commentaar in het schema
(`db/schema.ts:179-183`). Behandel dat als ontwerp, niet als bug.

**4. Verwijderen is voor 32 merken onmogelijk, en dat is een foreign key — geen keuze.**
`products.brand_id` verwijst naar `brands.id` **zonder** `onDelete: "cascade"`
(`db/schema.ts:347`). Hetzelfde geldt voor `categories` (`:241`), `enrichment_runs` (`:789`) en
`leads` (`:921`). Wél cascade: `brand_aliases` (`:214`), `organizations` (`:907`) en
`brand_uploads` (`:1007`, `:1030`).
→ De verwijderknop moet **vóóraf** tellen wat er hangt en dat tonen, niet de databasefout
opvangen en vertalen. Een gebruiker hoort te zien "1.016 producten, 1 prijslijst" en niet een
constraint-naam.

**5. `descriptionNl` is de omschrijvingskolom, niet `notes`.** `brands` heeft géén `notes`-kolom
— die hoort bij `suppliers`. Drizzle laat een onbekende sleutel **stil vallen**; alleen `tsc`
ving dat in 1.4. Draai `bunx tsc --noEmit` voor je iets afmeldt.

## Harde grenzen

- **Raak de bestaande 437 merkrijen niet aan.** Geen backfill, geen normalisatie, geen
  opschoonscript. Dit is G2 en het is niet onderhandelbaar.
- **Bouw geen tweede normalisatiemechanisme.** `brand_aliases` en `brandKeyOf` zijn van de
  leesroute-sessie. Als je denkt dat je merknamen moet normaliseren: dat doe je niet, dat is
  van hen.
- **IJzeren regel 5: elke schrijfactie logt een event.** Aanmaken, bewerken, levensfase
  wijzigen en verwijderen krijgen elk een event via `logEvent` (`lib/repo/events.ts`), met
  `entity: "brand"`. Er bestaat al een actie-naam uit 1.4: `brand_created_for_test` — die is
  bewust specifiek; kies voor de UI eigen namen.
- **IJzeren regel 2: geld beïnvloedt nooit de ranking.** De commerciële velden blijven daarom
  buiten het formulier (G6).
- **Stop vóór de push.** Committen mag; pushen doet alleen de sprintmaster (besluit W4 —
  `git push` stuurt élke commit op lokale `main` mee, ook die van een parallelle sessie).
- **`git add` altijd met expliciete bestandsnamen**, nooit `-A` — er draaien parallelle sessies
  in dezelfde werkdirectory.

## Waar je begint

| Wat | Waar |
|---|---|
| Het scherm | `app/admin/brands/page.tsx` |
| Server actions | `app/admin/actions.ts` (`setTierAction`, `setFieldVisibilityAction`) |
| Repo-laag | `lib/repo/admin.ts` (`listBrandsWithTier`, `setBrandTier`) |
| Component | `components/admin/brands-tier-block.tsx` |
| Schema | `db/schema.ts:179` (`brands`) |
| Events | `lib/repo/events.ts` |

Volg het patroon dat er staat: page → server action → repo-functie → `logEvent`. Wijk daar niet
van af.

## De levensfase — bewust klein houden

Er zijn al elf `pgEnum`'s in het schema; volg dat patroon. Houd de set **zo klein als de
werklijst vraagt**: er moet onderscheid zijn tussen "dit merk benaderen we" en "dit merk bestaat
niet meer, laat het met rust".

**Wat er bewust NIET in zit:** een verwijzing naar het opvolgende merk ("Murano Due = Leucos
geworden"). Timo heeft die vraag gekregen en niet gekozen — hij wilde de bestaande data met rust
laten. Vijf merken zouden zo'n opvolger hebben. Dat is een aparte beslissing met een
self-reference-migratie en raakvlak met de matcher; **bouw het niet, meld het als opvolgtaak.**

Nieuwe merken krijgen de actieve fase als default. **Geen backfill op bestaande rijen** — een
default op de kolom volstaat (zie `brand_relations`, dat dezelfde keuze maakte: `db/schema.ts:1019`).

## Definition of Done

1. Ik kan via `/admin/brands` een merk aanmaken, en het staat daarna in **Brand relations**
   (die lijst leest dezelfde tabel).
2. Ik kan datzelfde merk bewerken en de levensfase zetten.
3. Verwijderen van een merk **zonder** iets eraan: werkt, met event.
4. Verwijderen van een merk **mét** producten: geblokkeerd, met in het scherm de aantallen die
   in de weg zitten en de levensfase als alternatief.
5. Een dubbele naam of code **waarschuwt met een link naar het bestaande merk**, en laat je
   bewust doorgaan.
6. Alle vier de schrijfacties staan in de events-tabel.
7. **De 437 bestaande merken zijn ongewijzigd** — toon dat met een telling vóór en ná.
8. White-box RSC-test met screenshots (light/dark × mobile/desktop). Bekijk de PNG's zelf.
9. `bunx tsc --noEmit` schoon en `bun vitest run` groen.

## Modelverdeling per fase

| Fase | Model | Wat |
|---|---|---|
| **1. Probleem** | het lichtere model | Schrijf in eigen woorden op wat er nu níét kan en waarom, mét eigen metingen tegen de live database. Verifieer de vijf vallen hierboven zelf — neem ze niet over op mijn woord. Nog geen code |
| **2. Plan** | **het scherpste model, twee agents parallel** | Twee onafhankelijke plannen: schermindeling, waar de dubbelcheck landt, hoe de blokkade wordt getoond, welke enum-waarden. Laat ze botsen en kies per punt de sterkste, met argument |
| **3. Bouwen** | het lichtere model, twee agents | Eén op het datamodel + repo + actions, één op het scherm + component + tests. Ze delen de enum-naam en de actie-namen — leg die vóór de start vast |

## Wat expliciet buiten scope is

- **Milieu-informatie per merk.** Timo wil dit, maar later. Bouw het formulier zo dat een veld
  erbij goedkoop is; bouw het veld niet.
- **Merkpagina's** en een apart Brand Admin portal. Zelfde reden (G3).
- **Opschonen van de 18 geannoteerde merken.** Dat is Timo's werk, niet dat van een script (G2).
- **De opvolger-verwijzing.** Zie hierboven.

## Wat je meldt in plaats van repareert

Vind je onderweg een bug in bestaande code, meld hem met bewijs — repareer hem niet. Er staan
al drie opvolgtaken open uit 1.4; deze sprint mag ze niet stilzwijgend meenemen, want dan is
niet meer te zien wat 1.5 heeft veranderd. Bekend en dus géén nieuwe vondst:
`appliedFields` telt nieuwe producten niet mee, er is geen validatie op `valid_from` in de
toekomst, en er is geen CHECK op `valid_until >= valid_from`.
