# Sprint 1.9 — plan: de UI is Engels, ook op `/data/fields`

*Fase 1 (meten) en fase 2 (plan) van 21 juli 2026. Fase 1 corrigeerde de briefing op drie punten;
die correcties staan in §0 en zijn in dit plan verwerkt.*

## 0. Metingen — en drie correcties op de briefing

**Nulmeting (letterlijke SQL uit `docs/sprint1-7-fase1-probleem.md:53`):**

```
brands (ZZTEST uitgesloten): rijen = 436   md5 = 9e7695bf4b10ed555b27b5325d736c46
products:                    211317
```

Identiek aan de 1.7-baseline. Deze twee getallen moeten ná de migratie ongewijzigd zijn.

**Correctie 1 — `mini-scorecard.tsx` toont géén Nederlands.** De enige producent van `BucketBlok`
is `bucketBlok()` in `components/data/scorecard-blokken.ts:23`, en die doet letterlijk
`labelNl: bucket.labelEn`. De tooltips zijn al Engels. Wat er fout is, is uitsluitend de **naam**
van de property. Dat is een hernoeming, geen taalbug — maar hij hoort wel bij dit item.

**Correctie 2 — er is geen codepad dat Nederlands in rij 3 van het merk-Excel zet.**
`lib/excel-template.ts:39` leest `field.instructionEn`; `alsCatalogField()` vult die uit
`def.instructionEn`. De database laat zien wat er werkelijk gebeurde:

```
fce74f01 | label_nl "Recycled content (%)"        | label_en "Recycled content (%)"
         | instructie_nl  "Percentage gerecycled materiaal, bv. 30"
         | instruction_en "Percentage gerecycled materiaal, bv. 30"   ← beide NL
```

Dezelfde Nederlandse zin staat in *beide* instructievelden. Het formulier vroeg twee keer om
hetzelfde en kreeg twee keer hetzelfde antwoord. Dat maakt dit item niet kleiner maar scherper:
het probleem is precies dat er een tweede taalveld gevraagd wordt dat nergens toe dient, zodat de
invuller geen reden heeft de twee te onderscheiden.

**Correctie 3 — er staan 3 rijen in `custom_fields` en alle drie zijn gearchiveerd**
(`archived_at` gevuld), niet "2 gearchiveerd, 1 actief". Er is vandaag geen actief eigen veld.

## 1. De kernbeslissing: kolommen nullable maken, niet droppen

`label_nl` en `instructie_nl` blijven bestaan als **nullable legacy-kolommen**. Er wordt nooit meer
in geschreven; `db/schema.ts` kent ze niet meer; de drie gearchiveerde rijen behouden hun tekst.

- **Laten staan zoals ze zijn** kan niet: beide kolommen zijn `NOT NULL` met een not-empty-CHECK
  (`db/migrations/0015_eigen_velden.sql:42,44,53,54`). Elke insert móét ze vullen, en het enige dat
  je er dan in kunt zetten is een kopie van het Engels — een kolom die `label_nl` heet met Engels
  erin is precies de stille mismatch (`name_en: col("name")`) waar dit project een geschiedenis mee
  heeft en die 0015 in zijn eigen commentaar aanhaalt.
- **Droppen** is het schoonst maar destructief, op een database die tegelijk dev en productie is, in
  een migratiereeks (0004–0015) die zonder uitzondering additief is en die archiveren-boven-wissen
  als huisregel draagt. De winst boven nullable is bovendien puur cosmetisch: zodra `db/schema.ts`
  de kolommen niet meer kent, bestaan ze voor de applicatie niet.
- **Nullable** is niet-destructief, omkeerbaar en klein. Droppen kan later alsnog, samen met de
  opruiming van `labelNl`/`instructie` uit `lib/field-catalog.ts` (opvolgtaak, zie §6) — één
  bewuste opruimronde in plaats van twee halve.

**Subtiliteit die de migratie moet afdekken.** De CHECK-constraints van 0015 zijn *gecombineerd*
(NL én EN in één expressie). Alleen `DROP NOT NULL` zou technisch werken — `NULL AND true` is
`NULL`, en een CHECK die `NULL` oplevert slaagt — maar dat is drieweg-logica waar de volgende lezer
overheen kijkt. De gecombineerde constraints worden daarom vervangen door EN-only varianten, zodat
de bestaande garantie "een leeg Engels label of een lege Engelse instructie wordt door de dátabase
geweigerd" (getest in `lib/repo/custom-fields.test.ts`) letterlijk blijft staan.

### `db/migrations/0016_eigen_velden_engels.sql`

Handgeschreven, net als 0004–0015 (de drizzle-snapshots in `db/migrations/meta` stoppen bij 0003;
`db/migrate.ts` draait de `.sql`-bestanden gesorteerd met `--> statement-breakpoint` als scheiding).

```sql
ALTER TABLE custom_fields ALTER COLUMN label_nl DROP NOT NULL;
ALTER TABLE custom_fields ALTER COLUMN instructie_nl DROP NOT NULL;
ALTER TABLE custom_fields DROP CONSTRAINT custom_fields_labels_not_empty;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_label_en_not_empty
  CHECK (btrim(label_en) <> '');
ALTER TABLE custom_fields DROP CONSTRAINT custom_fields_instructions_not_empty;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_instruction_en_not_empty
  CHECK (btrim(instruction_en) <> '');
```

Alle statements zijn metadata-only: geen table rewrite, geen `UPDATE`, `brands` en `products`
worden niet aangeraakt. De fingerprint hoort dus identiek te blijven — meten vóór en ná, niet
aannemen.

## 2. Wijzigingslijst

| Bestand | Wat |
|---|---|
| `db/migrations/0016_eigen_velden_engels.sql` | **nieuw**, zie §1 |
| `db/test-db.ts` | 0016 importeren en uitvoeren (huispatroon) |
| `db/schema.ts` | `labelNl`/`instructieNl` uit `customFields`; commentaar: legacy in de DB, bewust niet in drizzle |
| `lib/custom-fields.ts` | `EigenVeldDef` verliest beide NL-velden; `alsCatalogField()` vult `labelNl: def.labelEn` en `instructie: def.instructionEn` als compat voor het `CatalogField`-contract |
| `lib/repo/custom-fields.ts` | `alsDef()`, `EigenVeldInvoer`, insert; create-event verliest de sleutel `labelNl`, `labelEn` blijft |
| `app/data/fields/actions.ts` | `Invoer` + `leesInvoer` lezen twee velden; foutmeldingen §4 |
| `app/data/fields/page.tsx` | mapping naar `EigenVeldRij` |
| `components/data/custom-field-form.tsx` | twee `Veld`-instanties weg; labels worden "Label" en "Instruction" |
| `components/data/custom-fields-table.tsx` | kolomkop "Label"; **regel 292 toont `labelEn`**; subregel vervalt; edit-prefill |
| `components/data/mini-scorecard.tsx` | `BucketBlok.labelNl` → `labelEn` |
| `components/data/scorecard-blokken.ts` | `labelNl: bucket.labelEn` → `labelEn: bucket.labelEn` |

Buiten `lib/repo/custom-fields.ts` bestaat er geen andere schrijver van `custom_fields`.

## 3. Tests

- **`components/data/custom-fields.test.tsx`** — fixtures verliezen NL. De tabeltest kantelt van
  "NL zichtbaar" naar "EN zichtbaar"; dat verbergt niets, want het verdwijnen van het NL-label ís
  de feature en het Engelse label wordt nog steeds hard getoetst. De formuliertest (regel 305)
  loopt over twee velden in plaats van vier, en krijgt er twee **negatieve** asserties bij:
  `[name="labelNl"]` en `[name="instructieNl"]` bestaan niet meer. Zo wordt de test niet zwakker
  maar een wachter tegen herintroductie (DoD 1).
- **`lib/custom-fields.test.ts`** — de exacte `toEqual` in de `alsCatalogField`-test documenteert
  voortaan de compat-mapping: `labelNl` draagt voor eigen velden Engels.
- **`lib/repo/custom-fields.test.ts`** — de diff-loggingtest patchte `labelNl`; die patcht nu
  `labelEn`. Het geteste mechanisme (changed-lijst uit de patch, met old/new) blijft identiek
  belast; alleen het voorbeeldveld wisselt. De constraint-test "leeg label / lege instructie wordt
  geweigerd" blijft **ongewijzigd** — dat is het bewijs dat de EN-only CHECKs de garantie van 0015
  overnemen. **Toevoegen:** één test dat een verse `createEigenVeld` een rij oplevert met
  `label_nl IS NULL` en `instructie_nl IS NULL` (rauwe select), zodat 0016 aantoonbaar draait en er
  geen verstopte schrijver is.
- **`lib/excel-template.test.ts:113` blijft ongewijzigd.** Die `f.labelNl` slaat op de interne
  velden van bucket 11 uit `FIELD_CATALOG` en bewaakt dat inkoopprijs/korting/voorraad in geen
  enkele taal in het merkbestand lekken. Alleen de `EIGEN`-fixture eronder verliest NL.
- **`lib/excel-validate.test.ts`, `lib/field-catalog.test.ts`, `lib/template-diff.test.ts`,
  `lib/repo/template-return.test.ts`, `lib/repo/brand-relations.test.ts`** — uitsluitend
  fixture-properties. Geen enkele assertie in die bestanden raakt een NL-veld, dus het weghalen
  ervan kan per constructie geen regressie maskeren.
- **`components/data/brand-relations.test.tsx`** — `BucketBlok`-fixtures, pure property-rename.

## 4. Foutmeldingen in `app/data/fields/actions.ts`

- `"Both labels are required — NL for us, EN for the brand."` →
  `"A label is required — it is the column header the brand sees (row 2)."`
- `"Both instructions are required. Row 3 …"` → `"An instruction is required. Row 3 of the brand
  Excel is the instruction; a column without one is a column nobody fills in."` — de tweede zin,
  de reden, blijft letterlijk staan.

## 5. Bouwvolgorde

1. `BucketBlok`-hernoeming (mini-scorecard, scorecard-blokken, brand-relations.test). Geïsoleerd →
   tsc schoon. Checkpoint.
2. Migratie 0016 + `db/test-db.ts`. `db/schema.ts` nog ongemoeid; de app schrijft de kolommen nog,
   en dat mag — ze bestaan nog. Checkpoint, dan `bun run db:migrate` en fingerprint hermeten.
3. De `EigenVeldDef`-keten in één slag (er is geen groen tussenpunt, het type is gedeeld):
   `db/schema.ts` → `lib/custom-fields.ts` → `lib/repo/custom-fields.ts` → `actions.ts` →
   `page.tsx` → formulier → tabel → de testfixtures. Checkpoint.
4. Verificatie: `bun vitest run`, fingerprint, DoD-grep, screenshots zelf bekijken, en handmatig
   een veld aanmaken + merk-Excel downloaden (DoD 2).

## 6. Wat we niet doen

- **`lib/field-catalog.ts` blijft onaangeraakt.** Opvolgtaak: de 132 NL-strings opruimen, `labelNl`
  en `instructie` uit het `CatalogField`-type halen (waarna de compat-mapping in `alsCatalogField`
  vanzelf vervalt) en desgewenst de legacy-kolommen alsnog droppen. Eén ronde, apart besloten.
- Geen datamutatie op de drie bestaande rijen — hun NL-tekst is historie.
- Geen `drizzle-kit generate`: het huispatroon sinds 0004 is handgeschreven SQL.
- Historische event-payloads met `labelNl` erin blijven staan. Events zijn onveranderlijke
  historie en niets leest die sleutel terug.
- De drie wisselvallige testbestanden (`brand-message`, `brand-admin`, `custom-fields`) niet
  repareren — bekend, geïsoleerd groen.
