# Sprint 1.8 · Fase 2 — het plan, en waarom

*Twee planagents (A en B) kregen dezelfde brief en werkten onafhankelijk. Ze zijn het op de
hoofdlijn eens; op zeven punten niet. Hieronder per punt de keuze mét argument, en daarna het
bevroren contract voor de twee bouwagents.*

## Waar A en B het al over eens waren

Beide komen ongevraagd op hetzelfde grondplan uit, en dat is een sterker signaal dan één plan
dat het beweert:

- Velddefinities in een eigen tabel `custom_fields` met **uuid-PK** — nodig omdat `events.entity_id`
  van het type `uuid` is.
- Waarden in **één** nieuwe kolom `products.custom_values jsonb`. Nooit in `tier2_source` (die
  staat in `visible_products` en wordt door de matcher gelezen).
- De pure laag krijgt de catalogus als **verplichte parameter** — niet async, geen module-globale
  staat.
- `measure.kind: "custom"`, gemeten met de sleutel als **query-parameter**, nooit via `sql.raw`.
- `SCHRIJF_MAPPING` blijft ongewijzigd; eigen velden komen er nooit in.
- Events op entity `custom_field`, met een changed-lijst die uit de patch wordt afgeleid (Val 7).
- Matcher-grens bewaakt met een test die de **view-definitie en de engine-bron** leest, niet het
  gedrag observeert.
- Alles text; geen typen, geen eigen buckets, geen promote-knop, geen per-merk velden.

Dat grondplan neem ik over. De zeven verschillen:

---

### 1. De sleutel — **B: `custom:<uuid>`**

A wilde `cf_<slug(labelEn)>`, immutabel na aanmaak. Leesbaar in events en in de JSONB, en dat is
een echt voordeel.

Het breekt alleen op A's eigen ontwerp: **A staat hernoemen toe.** Zodra iemand "Energieverbruik"
hernoemt naar "Recycled content", draagt het veld voor altijd de sleutel `cf_energieverbruik`.
Dan is de leesbaarheid geen voordeel meer maar een leugen — precies het soort stille
mismatch waar dit project al een geschiedenis mee heeft (`name_en: col("name")`, jarenlang
onopgemerkt omdat `name` bestáát).

B's uuid is ondoorzichtig maar eerlijk, kan per constructie niet botsen met een catalog-key
(die zijn `^[a-z0-9_]+$`) en overleeft hernoemen. Het leesbaarheidsverlies is gedekt doordat
elk event `labelEn` in zijn payload draagt.

**Geverifieerd vóór de keuze:** de dubbele punt is veilig in de selectie-sleutels van het
retour-pad. `selectieUit()` (`upload-actions.ts:164-172`) toetst alleen `^r\d+\.` en
`applyTemplateProposal` bouwt de sleutel opnieuw op met `fieldSelectionKey()` — de fieldKey
wordt nergens uit een samengestelde string terug-geparsed.

### 2. Wat `must` betekent voor een eigen veld — **B: nooit een bestandsafwijzing**

Dit is het scherpste verschil, en B's argument is het beste van beide plannen.

A houdt `must` uniform: een ontbrekende custom-must-kolom wijst het hele bestand af, met een
bevestigingsdialoog als waarschuwing. Dat betekent dat **één klik van Stefan elk merkbestand dat
al onderweg is onbruikbaar maakt** — bestanden die verstuurd zijn vóórdat het veld bestond, die
geen enkel merk had kúnnen invullen. Een bevestigingsdialoog repareert dat niet; hij maakt het
foutpad alleen consensueel.

B koppelt de harde afwijzing los, met een principiële grens: de afwijzing bestaat omdat
catalogus-musts **dragend zijn voor de verwerking zelf** — zonder `supplier_article_code` is er
geen sleutel om een rij aan een product te koppelen (`excel-validate.ts:370-373` zegt dat ook
letterlijk). Een veld van Stefan kan per definitie nooit dragend zijn voor de verwerking.

`must` op een eigen veld betekent dus: zwaarste weging in de scorecard, plus een
`must_veld_leeg`-rijwaarschuwing als de kolom er wél is. Nooit een afwijzing.

De prijs is eerlijk: "must" heeft nu twee licht verschillende betekenissen. Dat hoort in een
codecommentaar op de betreffende regel én in het recept, niet weggemoffeld.

### 3. Verwijderen — **B: archiveren (soft delete)**

A wilde de definitierij hard verwijderen en de waarden wees laten worden, met als argument dat
opnieuw aanmaken met hetzelfde label de waarden terugbrengt — "feitelijk een undo".

Dat argument werkt **alleen bij A's label-afgeleide sleutel**, en die is hierboven afgevallen.
Met een uuid-sleutel liggen de waarden na verwijderen onder een uuid die niemand meer heeft:
onherstelbaar. A's delete + B's sleutel is stille datavernietiging.

A verwerpt soft-delete omdat "de unique index dan partieel moet worden". Dat is één `WHERE
archived_at IS NULL` — geen complexiteit die tegen dataverlies opweegt.

Beide plannen zijn het er wél over eens dat de wáárden nooit gewist worden: dat zou een
mass-update over productrijen zijn, `updated_at` verzetten en de fingerprint-discipline van
elke volgende sprint breken.

### 4. Een `inExcel`-opt-out — **A: niet bouwen**

B wilde een checkbox, default aan. A wilde hem niet, omdat een derde veldsoort ontstaat.

A's motivering klopt niet helemaal — `excelColumns()` filtert al op `inExcel`, dus er komt geen
enkele nieuwe vertakking bij. Maar A's conclusie klopt wel, om een betere reden: er is vandaag
**geen ander invoerkanaal**. Het merkportaal-schrijfpad is 4.B en expliciet buiten scope. Een
veld met `inExcel: false` is dus een veld dat gegarandeerd voor altijd leeg blijft — exact de
valkuil die de briefing benoemt als "wat Stefans onderzoeksdata waardeloos zou maken",
aangeboden als vinkje met een nette naam.

Niet bouwen. De kolom is later additief toe te voegen als 4.B er is.

### 5. Hoe het schrijfdoel door de diff reist — **A: een discriminated union**

B wilde `FieldProposal.kolom: string` houden, met de conventie "voor een eigen veld is
`kolom === fieldKey`", en overal op de prefix branchen. Minder aanraakoppervlak — vier
consumenten blijven ongemoeid.

Maar dat is **letterlijk de constructie die fase 1 als gevaarlijkste bevinding aanwees**:
`template-diff.ts` is vandaag aan de veldcatalogus gekoppeld via een conventie die de compiler
niet ziet, en dáárom valt een onbekend veld er stil doorheen. Diezelfde fout herhalen in de
reparatie ervan kan niet.

A's `SchrijfDoel`-union maakt elke vergeten plek een typefout. De vier extra aanraakpunten zijn
eenmalig en liggen allemaal binnen de twee bouwagents.

### 6. GIN-index op `custom_values` — **A: geen index**

B stelde er een voor. Een GIN-index helpt niet bij `count(*) filter (…)` binnen de
gegroepeerde full scan van `completenessSelection()` — dat is de query die er echt toe doet.
Hij helpt alleen de incidentele teltelling bij archiveren, en kost bij élke productwrite.
Later additief toe te voegen als die telling meetbaar traag blijkt.

### 7. Kleinere keuzes

- **Instructies verplicht niet-leeg (A).** Rij 3 van het Excel is wat het merk vertelt wát het
  moet invullen. Een leeg instructieveld is precies hoe je een kolom krijgt die niemand invult.
- **Route `/data/fields` met een read-only overzicht van de 66 erboven (B).** Dat overzicht is
  geen decoratie: het is waar Stefan ziet dat zijn veld er nog niet bij staat, en het draagt de
  les "deze bestaan al" die het recept moet overbrengen.
- **`scorecardAggregate(filledByField, productCount, catalogus)` (B)** — catalogus achteraan,
  minder churn in bestaande aanroepen dan A's variant die hem vooraan zet.

---

## Het bevroren contract

Beide bouwagents coderen hiertegen. Wijkt iets af, dan stopt de betreffende agent en meldt het —
niet zelf bijbuigen.

```ts
// lib/custom-fields.ts — NIEUW en PUUR: geen imports uit db/, lib/repo/ of app/
import type { CatalogBucket, CatalogField, Compleetheidsniveau } from "@/lib/field-catalog";

export const EIGEN_VELD_PREFIX = "custom:" as const;

export type EigenVeldDef = {
  id: string;                    // uuid, PK van custom_fields; óók de sleutel in products.custom_values
  labelNl: string;               // niet-leeg
  labelEn: string;               // niet-leeg — de Excel-kolomkop (rij 2)
  instructieNl: string;          // niet-leeg
  instructionEn: string;         // niet-leeg — rij 3 van het Excel
  niveau: Compleetheidsniveau;   // "must" | "wanna" | "nice"
  bucketKey: string;             // key van een van de 10 template-buckets; nooit "intern"
  createdAt: string;             // ISO; bepaalt de volgorde binnen de bucket
  archivedAt: string | null;     // null = actief
};

export function eigenVeldKey(def: Pick<EigenVeldDef, "id">): string;   // EIGEN_VELD_PREFIX + id
export function isEigenVeldKey(fieldKey: string): boolean;
export function eigenVeldIdVan(fieldKey: string): string | null;
export function alsCatalogField(def: EigenVeldDef): CatalogField;
//   → { key: eigenVeldKey(def), matcher: false, internalOnly: false, inExcel: true,
//       measure: { kind: "custom", fieldId: def.id }, … }
export function catalogusMet(eigen: readonly EigenVeldDef[]): CatalogBucket[];
//   kopie van FIELD_CATALOG; actieve (archivedAt === null) eigen velden achteraan hun bucket,
//   gesorteerd op (createdAt, id). Muteert FIELD_CATALOG nooit.
export function labelBotsing(
  labelEn: string,
  eigen: readonly EigenVeldDef[],
  negeerId?: string,
): { met: "catalogus" | "eigen"; bestaandLabelEn: string } | null;
//   vergelijkt via normLabel() uit lib/excel-validate.ts — één normalisatie, geen tweede kopie
```

```ts
// lib/field-catalog.ts
export type FieldMeasure =
  | { kind: "column"; column: string }
  | { kind: "price" }
  | { kind: "custom"; fieldId: string }   // NIEUW
  | { kind: "none" };

export function excelColumns(catalogus: readonly CatalogBucket[]): { bucket; field }[];
export function templateBuckets(catalogus: readonly CatalogBucket[]): { bucket; fields }[];
export function measurableFields(catalogus: readonly CatalogBucket[]): { bucket; field }[];
export function scorecardAggregate(
  filledByField: Record<string, number>,
  productCount: number,
  catalogus: readonly CatalogBucket[],
): ScorecardAggregate;
// bucketScore() ONGEWIJZIGD.
// Parameter verplicht, GEEN default — een default laat elke bestaande aanroep stil zonder
// eigen velden doorcompileren, en dat is de stille drift die `measure` ooit vijf weken kostte.
```

```ts
// lib/excel-template.ts
export async function buildMasterTemplateXlsx(catalogus: readonly CatalogBucket[]): Promise<Uint8Array>;

// lib/excel-validate.ts
export async function validateFilledTemplateXlsx(
  bytes: Uint8Array | ArrayBuffer,
  catalogus: readonly CatalogBucket[],
  context?: ValidatieContext,
): Promise<ValidatieResultaat>;
export function normLabel(tekst: string): string;   // bestaande private helper wordt geëxporteerd

// lib/template-diff.ts
export type SchrijfDoel =
  | { kind: "kolom"; kolom: keyof typeof products.$inferSelect }
  | { kind: "custom"; fieldId: string };
export function doelType(doel: SchrijfDoel): KolomType | null;
//   "kolom"  → kolomTypeVan(doel.kolom)   (ongewijzigd)
//   "custom" → altijd "text"
export function diffTemplateRows(
  rijen: GelezenRij[],
  bestaand: Map<string, BestaandProduct>,
  waarschuwingen: RijWaarschuwing[],
  actieveEigenVelden: ReadonlySet<string>,   // keys die NU bestaan en actief zijn
): TemplateProposal;
// FieldProposal.kolom (string) wordt VERVANGEN door doel: SchrijfDoel op de varianten
// new/changed/unchanged en op ConflictReden.clear/unprocessable.

// lib/repo/custom-fields.ts — NIEUW, enige db-lezer/schrijver van definities
export async function listEigenVelden(db: AppDb, opts?: { metGearchiveerd?: boolean }): Promise<EigenVeldDef[]>;
export async function laadCatalogus(db: AppDb): Promise<CatalogBucket[]>;   // = catalogusMet(await listEigenVelden(db))
export async function telProductenMetWaarde(db: AppDb): Promise<Map<string, number>>;  // per def-id
export async function createEigenVeld(db, invoer, actor?): Promise<EigenVeldDef>;
export async function updateEigenVeld(db, id, patch, actor?): Promise<EigenVeldDef>;
export async function archiveEigenVeld(db, id, actor?): Promise<{ ok: true; productsWithValue: number } | { ok: false }>;
```

**Events** (entity `custom_field`, entityId = de uuid, kolom heet `action`):

| action | payload |
|---|---|
| `custom_field_created` | `{ labelNl, labelEn, niveau, bucketKey }` |
| `custom_field_updated` | `{ fields: { <veld>: { old, new } } }` — afgeleid uit de patch, geen handlijst |
| `custom_field_archived` | `{ labelEn, productsWithValue }` |

**Migratie `db/migrations/0015_eigen_velden.sql`** — `custom_fields` met uuid-PK, CHECKs op
niveau, `bucket_key <> 'intern'`, niet-lege labels én instructies; partiële unique index op de
genormaliseerde `label_en` waar `archived_at is null`; `ALTER TABLE products ADD COLUMN
custom_values jsonb`. Geen GIN-index. Registratie in `db/test-db.ts`.

**Labelbotsing is deels een DB-constraint:** eigen↔eigen wél (de partiële unique index, die ook
bij hernoemen aanslaat), eigen↔catalogus niet — die 66 labels leven in TypeScript en kan de
database niet kennen; dat blijft `labelBotsing()` in de server-actie, met `dubbele_kolomkop` als
luide achtervang.

## Werkverdeling

**Agent 1 — datamodel, repo, integratie.** `db/migrations/0015_eigen_velden.sql` ·
`db/schema.ts` · `db/test-db.ts` · `db/matcher-grens.test.ts` · `lib/custom-fields.ts` ·
`lib/repo/custom-fields.ts` · `lib/field-catalog.ts` · `lib/excel-template.ts` ·
`lib/excel-validate.ts` · `lib/template-diff.ts` · `lib/repo/template-return.ts` ·
`lib/repo/brand-relations.ts` · `app/data/brand-relations/template/route.ts` ·
`app/data/brand-relations/[brandId]/upload-actions.ts` · de bijbehorende `.test.ts`-bestanden.

**Agent 2 — scherm, scorecard-weergave, recept.** `app/data/fields/page.tsx` +
`actions.ts` · `components/data/custom-fields-table.tsx` + `custom-field-form.tsx` +
`custom-fields.test.tsx` · `components/data/template-proposal.tsx` (+ test) ·
`app/data/brand-relations/[brandId]/upload/[uploadId]/page.tsx` ·
`components/data/data-cards.tsx` · `docs/milieuvelden-toevoegen.md`.

Geen bestand staat op beide lijsten. `getTemplateReturn()` levert voortaan
`eigenVelden: EigenVeldDef[]` mee, zodat agent 2 het voorstel-scherm van labels kan voorzien
zonder eigen db-pad.

## Bewust niet

Geen `inExcel`-vlag · geen getypte velden · geen hard delete of waarde-wipe · geen eigen buckets
of herordening · geen GIN-index · geen promote-naar-catalogusveld-knop · geen per-merk velden ·
geen hergebruik van `brand_field_visibility` (Val 8 — andere semantiek) · geen wijziging aan
`visible_products`, `visible_specs`, `tier2_source` of iets onder `lib/matching/` · geen
reparatie van bugs die onderweg opduiken (melden met bewijs).
