# Sprint 1.7 · Fase 2 — het plan, na de botsing

Twee planners hebben onafhankelijk hetzelfde probleem uitgewerkt. Ze zijn het over het skelet
eens; ze botsen op drie punten. Hieronder eerst wat vaststaat, dan de drie beslissingen met
argument.

## Waar beide planners uit zichzelf op uitkwamen

Dat maakt het geen keuze meer, maar een gegeven:

- **Twee kolommen op `brands`**, geen `brand_factories`-tabel, geen plaats/land-splitsing.
- `factory_location text NULL` — het feit van het merk; `factory_distance_km integer NULL` —
  onze berekening. Nullable, géén default: dat is precies "leeg blijft leeg", en het is het
  bestaande huispatroon (`payment_term_days`, `delivery_time_days`).
- **`integer`, geen `numeric`.** Sub-kilometerprecisie op 200–1500 km is schijnnauwkeurigheid.
- **Twee CHECK-constraints**: `km > 0` (0 zou "de fabriek staat in Utrecht" betekenen — elke 0
  die binnenkomt ís het leeg-werd-0-ongeluk) en `km NOT NULL ⇒ location NOT NULL`.
- **Het adres wordt één constante in een nieuw bestand.** Geen herrekenmechanisme, geen
  geocoding: zonder kaartdienst is herrekenen per definitie handwerk, en een "herbereken"-knop
  zou theater zijn.
- **Eigen `<fieldset>` met `<legend>`**, niet in de `FIELDS`-array.
- **Type-level exhaustiveness-guard** op de hardgecodeerde `changed`-lijst
  (`lib/repo/brands.ts:211`), zodat een vergeten veld een `tsc`-fout wordt in plaats van een
  stil gat.

Beide planners melden bovendien dezelfde drie dingen in bestaande code (zie §Meldingen).

## Botsing 1 — een derde kolom `factory_distance_basis`?

**B wil hem**: de repo stempelt bij elke afstandsschrijving het dan geldende Brink-adres, zodat
je na een verhuizing exact weet welke getallen nog tegen het oude adres gemeten zijn.
**A wil hem niet**: de locatiekolom maakt elke afstand al herrekenbaar.

**Besluit: geen derde kolom.** B noemt hem zelf "de keuze die ik als eerste zou inleveren", en
dat is terecht. Een verhuizing is geen per-rij-gebeurtenis maar een globale: op dat moment zijn
*alle* niet-lege afstanden verdacht, en dat weet je zonder stempel. De werklijst is één query
(`where factory_distance_km is not null`), en die zet ik als commentaar direct naast het adres
dat je op dat moment aan het wijzigen bent.

B's beste tegenwerping — "wat als sommige afstanden ná de verhuizing zijn ingevoerd?" — heeft al
een antwoord in het systeem: het event draagt actor én tijdstip (ijzeren regel 5). Voor/ná de
verhuizing is dus een datumvergelijking, geen kolom. Daar staat tegenover dat de stempelkolom
drie codepaden nodig heeft (stempelen bij wijziging, níét stempelen bij een naamswijziging,
wissen bij leegmaken) voor iets dat niemand intypt — B moest dat in het plan expliciet uitredeneren,
en dat is precies het soort kolom dat stil verkeerd komt te staan.

## Botsing 2 — eigen event of één naam erbij in `payload.changed`?

**A**: de velden meenemen in de bestaande `changed`-lijst van `brand_updated`. Kleiner.
**B**: een eigen `brand_environment_changed` met `{from, to}`-waarden.

**Besluit: B — een eigen event met waarden.** `payload.changed` logt veldnámen, geen waarden.
Voor de meeste velden is dat prima. Maar de briefing wijst dit ene veld expliciet aan als het
veld met een belangenconflict: de kilometers zijn de afstand tot óns adres, en zodra dat
meeweegt heeft een merk er belang bij laag te schatten. "Iemand heeft de afstand gewijzigd"
zonder de oude waarde is dan geen audittrail.

Het precedent staat al in hetzelfde bestand: `updateBrand` geeft `lifecycle` een eigen event met
`{from, to}`, en het commentaar op `lib/repo/brands.ts:183-185` zegt waarom — "wie zette welk
merk op vervallen" moet leesbaar zijn zonder door veldlijsten te grepen. Dat argument geldt hier
woordelijk. Datzelfde precedent lost ook de dubbelloggen-bezwaar op: de milieuvelden gaan in het
eigen event en **niet** in `changed`, exact zoals lifecycle.

## Botsing 3 — de milieuvelden ook op het aanmaakscherm?

**A**: tonen én schrijven; `createBrand` neemt ze mee in de `brand_created`-payload.
**B**: laat het impliciet (één gedeeld formulier), zonder de create-kant uit te werken.

**Besluit: A — tonen én schrijven.** Het formulier is gedeeld, dus de velden vérschijnen sowieso
op `/admin/brands/new`. Een formulier dat een veld toont en de invoer stil weggooit is erger dan
een iets grotere diff — en het is exact het faalpatroon dat dit project al één keer heeft
gekost (de import die zichzelf mislukt noemde). De DoD vraagt alleen bewerken; schrijven bij
aanmaken is de goedkoopste manier om het scherm niet te laten liegen.

## Kleine keuzes, zonder botsing

- **Bestandsnaam voor de constante: `lib/brink.ts`** (B), niet `lib/company.ts` (A). Er bestaat
  al een `organizations`-tabel; "company" zou daar tegenaan lezen. `brink.ts` is ondubbelzinnig.
- **Geen `measured_by` / `measured_at`-kolommen.** Het event draagt actor en tijdstip al.
- **Geen registratie in `lib/field-catalog.ts`.** Dat is een harde grens (1.6 zit erin), én
  inhoudelijk juist: de catalogus meet met `measure: col(...)` over *product*kolommen en gaat
  over wat we in het merk-Excel vrágen. Dit is een merkveld dat Brink zelf invult. Dit is een
  afwijking van de letter van **G16** en wordt als zodanig gemeld, niet stil gedaan.

## Het datamodel

```sql
-- db/migrations/0014_milieu_fabrieksafstand.sql
ALTER TABLE brands ADD COLUMN factory_location text;
ALTER TABLE brands ADD COLUMN factory_distance_km integer;
ALTER TABLE brands ADD CONSTRAINT brands_factory_distance_km_positive
  CHECK (factory_distance_km IS NULL OR factory_distance_km > 0);
ALTER TABLE brands ADD CONSTRAINT brands_factory_distance_needs_location
  CHECK (factory_distance_km IS NULL OR factory_location IS NOT NULL);
```

Nullable `ADD COLUMN` zonder default is in PG metadata-only (lichter nog dan 0013, dat een
default had). De CHECKs doen een validatiescan die alleen **leest**; alle 438 rijen zijn
NULL/NULL en dus triviaal geldig. Geen backfill, geen `UPDATE`, `updated_at` onaangeroerd.

⚠️ **`db/test-db.ts` importeert elke migratie expliciet** (regel 9-22). 0014 moet daar erbij,
anders draaien de tests tegen een schema zonder de nieuwe kolommen.

## Te wijzigen bestanden

| Bestand | Wat |
|---|---|
| `db/migrations/0014_milieu_fabrieksafstand.sql` | nieuw — SQL hierboven, met kopcommentaar in huisstijl |
| `db/test-db.ts` | import + toepassing van 0014 |
| `db/schema.ts` | twee kolommen in `brands`, met de feit/berekening-scheiding in commentaar |
| `lib/brink.ts` | nieuw — `BRINK_ADDRESS`, plus de verhuis-werklijstquery als commentaar |
| `lib/repo/brands.ts` | `BrandInput` +2; `getBrandForEdit`, `createBrand`, `updateBrand`; het eigen event; de exhaustiveness-guard |
| `app/admin/brands/actions.ts` | `BrandFormValues` +2, `readValues`, `toInput`, twee validatieregels |
| `components/admin/brand-form.tsx` | het milieublok; `emptyValues`, `BrandFormBrand` |
| `lib/repo/brands.test.ts` | round-trip, leeg-blijft-leeg, het eigen event |
| `components/admin/brand-admin.test.tsx` | fixtures, assertions, screenshots |

## DoD-metingen

| # | Bewijs |
|---|---|
| 1 | Handmatig op testmerk `ZZTEST QA-15`: locatie + km invullen, opslaan, herladen, wijzigen |
| 2 | RSC-test: bij `factoryDistanceKm: null` is de inputwaarde `""`, en "0" staat nergens in het blok |
| 3 | Query op `events` na stap 1 → `brand_environment_changed` met `{from, to}` |
| 4 | De letterlijke SQL uit fase 1, vóór en ná: tweemaal `436 / 9e7695bf4b10ed555b27b5325d736c46`, plus non-null-count = 0 |
| 5 | `grep -rn "Veldzigt\|3454 PW" --include='*.ts*' .` → exact één treffer, `lib/brink.ts` |
| 6 | `bun vitest run` levert de vier `brand-form.*.png`'s met het milieukopje; zelf bekijken |
| 7 | `bunx tsc --noEmit` schoon (baseline vóór het werk: schoon), `bun vitest run` groen |

## Meldingen — gevonden, niet gerepareerd

Beide planners vonden onafhankelijk hetzelfde; dat verhoogt het vertrouwen.

1. **De "één regel"-belofte in `components/admin/brand-form.tsx:10-11` is niet waar.** De comment
   belooft dat het latere milieuveld één regel in `FIELDS` is. Dat klopt niet: de array kent geen
   secties (Timo eist een eigen kopje) en de renderer zet hardcoded `type="text"` (kilometers zijn
   numeriek). Bovendien moesten `BrandFormValues`, `readValues`, `toInput` en de changed-lijst
   sowieso al mee. Het commentaar wordt bijgewerkt in het bestand dat toch wijzigt; `FIELDS`
   zelf blijft ongemoeid.
2. **`deleteBrand` kan "succes" melden zonder iets te doen** (`lib/repo/brands.ts:376-377`):
   verdwijnt het merk tussen de impact-check en `getBrandForEdit`, dan volgt `{ok:true}` zonder
   DELETE en zonder event. Race-window verwaarloosbaar bij één beheerder. Niet gerepareerd.
3. **`updateBrand` returnt stil bij een verdwenen merk** (`:193-194`) en `updateBrandAction`
   geeft daarna `{status:"idle"}` — een edit op een verwijderd merk oogt als geslaagd. Niet
   gerepareerd.
4. **Verouderde 437-tellingen** in commentaar en fixtures (`app/admin/brands/[brandId]/page.tsx:17`,
   `brand-admin.test.tsx`, kop van `lib/repo/brands.test.ts`). Het zijn er 436 + 2 testmerken.
   Cosmetisch; niet aangeraakt.
5. **De briefing verwijst naar `db/schema.ts` "rond regel 179"**; `brands` staat op 194.
