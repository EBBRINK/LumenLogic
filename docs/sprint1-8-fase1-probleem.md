# Sprint 1.8 · Fase 1 — de gemeten stand

*Alle getallen komen uit eigen read-only queries tegen de live database op 21 jul 2026 en uit
grep over de werkboom op `origin/main` (`4c22dd8`). Niets uit de briefing is overgenomen
zonder toets.*

---

## 1. Correctie op de briefing: het zijn **9** lezers, niet 13

De briefing zegt: *"Dertien bestanden lezen de veldcatalogus (`db/schema.ts` incluis)."*
Getoetst met `grep -rln 'from "@/lib/field-catalog"'` over de hele werkboom.

**Negen niet-test-bestanden importeren daadwerkelijk uit `lib/field-catalog.ts`:**

| # | Bestand | Wat het importeert | Moet het een tweede soort veld snappen? |
|---|---|---|---|
| 1 | `lib/excel-template.ts` | `excelColumns()` | **JA** — bouwt de kolommen van het merk-Excel |
| 2 | `lib/excel-validate.ts` | `excelColumns()`, `Compleetheidsniveau` | **JA** — herkent kolomkoppen op labeltekst |
| 3 | `lib/repo/brand-relations.ts` | `bucketScore`, `measurableFields`, `scorecardAggregate`, `FIELD_CATALOG` | **JA** — genereert de meet-SQL |
| 4 | `components/data/template-proposal.tsx` | `FIELD_CATALOG` | **JA (zwak)** — key→label-lookup; onbekende key = leeg label |
| 5 | `components/data/brand-scorecard.tsx` | alléén *types* (`CategorieScore`, `FieldCoverage`, …) | nee — rendert wat de aggregatie oplevert |
| 6 | `components/data/scorecard-blokken.ts` | alléén *types* (`BucketScore`, `CatalogBucket`) | nee |
| 7 | `lib/brand-message.ts` | alléén *types* (`BucketScore`, `CatalogBucket`) | nee |
| 8 | `app/data/brand-relations/page.tsx` | `INTERNAL_BUCKET_KEY` (constante) | nee |
| 9 | `components/data/brand-relations-table.tsx` | `GEEN_REACTIE_DAGEN` (constante) | nee |

**Vijf bestanden nóemen de veldcatalogus alleen in commentaar en importeren niets:**
`app/data/brand-relations/template/route.ts`, `components/data/price-list-expiry-notice.tsx`,
`db/schema.ts`, `lib/template-diff.ts`, en `lib/field-catalog.ts` zelf.

Zeven testbestanden importeren wél; die tellen niet als "lezer die iets moet begrijpen" maar
wél als vangnet.

### De gevaarlijkste lezer importeert niets

⚠️ **`lib/template-diff.ts` staat in de commentaar-lijst en is toch de scherpste rand van dit
item.** Het bestand koppelt aan de veldcatalogus via de *conventie* dat `SCHRIJF_MAPPING`
(`lib/template-diff.ts:37`) gesleuteld is op catalog-key — zonder één import. De compiler ziet
die koppeling dus niet.

Concreet gevolg, af te lezen aan `veldVoorstel()` (`lib/template-diff.ts:518-528`):

```ts
const kolom = SCHRIJF_MAPPING[fieldKey];
if (!kolom || !kolomType) {
  return ruw === "" ? null : { kind: "conflict", fieldKey, reden: { code: "not_storable", ruw } };
}
```

Een eigen veld van Stefan heeft per definitie **geen** entry in `SCHRIJF_MAPPING`. Zonder
ingreep komt een ingevulde waarde het retour-pad dus binnen als `not_storable`: **zichtbaar op
het voorstelscherm, maar niet opslaanbaar.** DoD 4 ("een ingevulde waarde overleeft het
volledige retour-pad") faalt dan stil-maar-netjes. Dit is het precieze punt waar het bouwplan
moet ingrijpen, en het is geen bug maar bestaand, bewust ontwerp (het commentaar op regel 37
noemt schrijven expliciet een apart besluit van meten).

### Wat dit betekent voor de omvang

De vrees uit de briefing — *"elk van die lezers moet een tweede soort veld gaan begrijpen"* — is
**te pessimistisch, mits het ontwerp de juiste laag kiest.** Vijf van de negen importeren
uitsluitend types of losse constanten. Zij veranderen niet, ongeacht wat we bouwen.

De echte kern is drie afgeleide functies:

- `excelColumns()` — voedt lezer 1 en 2
- `measurableFields()` / `FIELD_CATALOG` — voedt lezer 3 en 4
- `templateBuckets()` — afgeleid uit `excelColumns()`, voedt de scorecard-indeling

**Wie de eigen velden in die drie afgeleiden mengt in plaats van in de lezers, houdt het aantal
plekken dat "twee soorten velden" moet kennen op drie plus `template-diff.ts`.** De harde
prijs daarvan staat hieronder onder Val 5: die functies zijn vandaag synchroon en puur.

---

## 2. Nulmeting voor DoD 7 (fingerprints vóór)

Query voor merken letterlijk overgenomen uit `docs/sprint1-7-fase1-probleem.md`; eigen
uitvoering, eigen uitkomst.

```sql
select count(*)::int as rijen,
       md5(string_agg(
         concat_ws('|', id::text, name, coalesce(brand_code,''), slug,
           coalesce(country,''), disclosure_tier::text,
           coalesce(description_nl,''), coalesce(website,''),
           to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.USOF')),
         E'\n' order by id)) as md5
  from brands where name not like 'ZZTEST%';
```

```
merken   rijen = 436      md5 = 9e7695bf4b10ed555b27b5325d736c46
```

**Reproduceert de 1.7-baseline exact.** De 436 uit de sessie-instructie is bevestigd, en de
hash is nu voor het eerst over twee sessies heen stabiel gebleken.

Producten (nieuwe fingerprint — 1.7 legde er geen vast; alléén id + `updated_at`, want dat is
wat een ongewenste schrijfactie zou verzetten):

```sql
select count(*)::int as rijen,
       md5(string_agg(concat_ws('|', id::text,
         to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.USOF')),
       E'\n' order by id)) as md5
  from products;
```

```
producten   rijen = 211317   md5 = 942e054f307ad2a59455f7c2745634a1
```

Merken per aanmaakdag, ter bevestiging van de afbakening:

| Aanmaakdag | Rijen | Wat |
|---|---|---|
| 2026-07-02 | **436** | de bronimport |
| 2026-07-20 | 1 | `ZZTEST QA-14` |
| 2026-07-21 | 1 | `ZZTEST QA-15` |

---

## 3. De vier vallen — zelf getoetst

### Val 1 — labelbotsing in het Excel. **BEVESTIGD, en erger dan de briefing zegt.**

`lib/excel-validate.ts:164` normaliseert vóór de vergelijking: NFKC, onzichtbare spaties,
witruimte-collaps, lowercase, dan exact. Twee kolommen die op hetzelfde veld matchen leveren
`dubbele_kolomkop` op — en dat is een **harde afwijzing van het hele bestand**
(`:343-352`), geen waarschuwing.

De botsing is dus niet "stil de verkeerde kolom vullen" maar iets scherpers: **één eigen veld
met een botsend label maakt élk ingevuld merkbestand onbruikbaar**, voor alle merken tegelijk,
tot iemand het veld hernoemt. De controle bij het aanmaken moet dus op de **genormaliseerde**
labeltekst (`normLabel`), niet op de exacte tekst — de briefing zegt terecht "niet alleen op de
exacte tekst", maar onderschat het gevolg.

⚠️ Extra, niet in de briefing: de botsing kan ook tussen twee **eigen** velden ontstaan, en ze
kan ontstaan door het *hernoemen* van een bestaand eigen veld — niet alleen bij aanmaken.

### Val 2 — het bestand groeit. **BEVESTIGD, met een getal.**

`excelColumns()` levert vandaag **66 kolommen**; `lib/excel-template.ts:63-66` geeft elke kolom
een breedte van 16–40 tekens. Bij twintig extra velden is dat ruwweg een derde meer breedte, bij
elk merk, voor altijd — terwijl `lib/excel-validate.ts:359-368` élk ontbrekend `wanna`/`nice`-veld
als `ontbrekendeOptioneleKolommen` terugmeldt.

Ontwerpvraag voor fase 2, zoals de briefing voorschrijft. Eén meetbaar feit dat de keuze
stuurt: promoveren tot `must` is een **breaking change voor bestanden die onderweg zijn**
(`lib/excel-validate.ts:356` en het HANDOVER-commentaar aldaar) — een ontbrekende must-kolom is
een afwijzing. Een eigen veld op `must` zetten mag dus nooit stilzwijgend gaan.

### Val 3 — `measure` is de meet-brug en is eerder stukgelopen. **BEVESTIGD en scherper te maken.**

`lib/repo/brand-relations.ts:161-183` genereert de meet-SQL uit `measurableFields()`:

```ts
selection[field.key] = sql`count(*) filter (where ${sql.raw(`"${column}"`)} is not null)`;
```

Er staat al een guard vóór die interpolatie (`:169`, `/^[a-z0-9_]+$/`) die gooit bij een
ongeldige kolomnaam. **Dat is een echte SQL-injectie-poort zodra een gebruiker de naam
bepaalt** — vandaag is die naam altijd van een programmeur. Een eigen veld moet daarom
per constructie een `measure` krijgen die *niet* uit gebruikersinvoer een identifier maakt;
een JSONB-sleutel hoort als **parameter** in de query, nooit via `sql.raw`.

Daarmee is de briefing-eis "*ontwerp zo dat een eigen veld niet kán bestaan zonder geldige
meting*" gratis haalbaar: als alle eigen velden in één JSONB-kolom leven, is hun meting
**dezelfde uitdrukking voor elk veld**, met de sleutel als parameter. Er valt niets uit sync te
lopen, want er is geen per-veld kolomkeuze meer. Dat is een sterker resultaat dan een
consistentietest.

### Val 4 — 1.6 heeft de scorecard net verbouwd. **BEVESTIGD, en het model is bruikbaar.**

`templateBuckets()` (`lib/field-catalog.ts:280-291`) leidt categorie 1 t/m 10 af uit
`excelColumns()`. Bucket 11 `intern` valt er vanzelf buiten omdat hij nul 📄-velden heeft.
`scorecardAggregate()` (`:509-515`) bouwt categorie 1-10 uit `templateBuckets()` en plakt
categorie 11 er rechtstreeks uit `FIELD_CATALOG` achteraan met `inTotals: false`.

Gevolg dat het plan moet gebruiken: **een eigen veld dat via `excelColumns()` binnenkomt,
verschijnt automatisch en correct in de scorecard-categorie van zijn bucket, en telt automatisch
mee in de veldgewogen totalen.** Er is geen tweede indeling nodig en er moet er ook geen komen.
Het invariant `scoredFieldCount === templateFieldCount` (`:419-422`) is meteen de test.

---

## 4. Vijf vallen die de briefing niet noemt

**Val 5 — `excelColumns()` is synchroon en puur; eigen velden staan in de database.**
Dit is de zwaarste consequentie van het hele item. `lib/excel-validate.ts` draagt in zijn kop
uitdrukkelijk *"PUUR: geen imports uit db/, lib/repo/ of app/"* als ontwerpdoel voor 4.B, en
`lib/template-diff.ts` heet *"Puur: geen database, geen tijd, geen willekeur"*. Zomaar
`excelColumns()` async maken of er een db-import in trekken sloopt dat doel in beide modules.
Fase 2 moet expliciet kiezen: velddefinities als **parameter** door de pure laag heen, of een
laadfunctie erboven. Dit is de belangrijkste ontwerpvraag van het item.

**Val 6 — `products` heeft nu één JSONB-kolom, en die is bezet.**
`information_schema`: `products.tier2_source jsonb` is de enige. Hij draagt *herkomst per
verrijkt veld* (`lib/matching/engine.ts:250-254`, `components/product/product-card.tsx:90`) en
wordt door de matcher gelezen. **Eigen veldwaarden mogen daar dus niet in** — dat is precies
de route waarlangs een eigen veld de matcher wél zou bereiken. Er is een nieuwe kolom of tabel
nodig. `products` heeft vandaag 82 kolommen.

**Val 7 — `updateBrand()`-patroon: een hardgecodeerde `changed`-lijst.**
1.7 stelde vast dat `lib/repo/brands.ts` een handmatige lijst gewijzigde veldnamen logt. Ieder
schrijfpad voor eigen velden moet zijn eigen event loggen; erop rekenen dat een bestaand pad
meelogt, is precies hoe 1.7 bijna een veld stil liet wegvallen.

**Val 8 — `brand_field_visibility` bestaat al en lijkt hierop.**
`information_schema` geeft een tabel `brand_field_visibility (id, brand_id, field text, visible
bool, created_at)`. Dat is **geen** velddefinitietabel maar per-merk zichtbaarheid van
bestaande velden. Niet hergebruiken, niet uitbreiden, wel benoemen in het recept — de naam
nodigt uit tot verwarring.

**Val 9 — de briefing verwijst naar niet-bestaande/verouderde bronnen.**
`docs/sprint1-5-fase1-probleem.md` (waar de fingerprint-query zou staan) bestaat; de query staat
echter in `docs/sprint1-7-fase1-probleem.md`. De briefing noemt **437** merken en verwijst naar
1.5 — beide achterhaald; de sessie-instructie corrigeert dit al naar 436 en 1.7.

---

## 5. Waarom de matcher structureel onbereikbaar is (voorwerk voor DoD 5)

Geen belofte maar een gemeten grens. De match-engine leest productgegevens uitsluitend via
`visibleProducts` (`lib/matching/engine.ts:25,186`). `visible_products` is een view met een
**expliciete kolomlijst**, opgehaald met `pg_get_viewdef`:

```sql
SELECT p.id, p.article_code, p.name, p.brand_id, p.brand_name, p.supplier_article_code,
       p.category_id, p.category_path, p.description, p.lumen_output, p.max_wattage,
       p.kelvin, p.cri, p.ip_value, p.beam_angle, p.dimmable, p.light_source,
       p.height_cm, p.width_cm, p.length_cm, p.diameter_cm, p.color_1, p.material_1,
       p.tier2_source, p.warranty_months, p.repairability, p.epd_lifetime_hours,
       p.country_of_origin, p.status, pr.gross_price, pr.currency, pr.price_list_id,
       pl.valid_until
  FROM products p
  JOIN prices pr ON pr.product_id = p.id
  JOIN price_lists pl ON pl.id = pr.price_list_id
 WHERE pl.valid_from <= CURRENT_DATE AND pl.valid_until >= CURRENT_DATE;
```

Geen `SELECT *`. De enige andere aanraking van de basistabel in de engine is een kale
`exists (select 1 from products where brand_id = …)` (`:314`) die geen enkel veld leest.

**Daarmee is de grens structureel, niet conventioneel:** een eigen veld dat buiten deze
kolomlijst leeft is voor de matcher onzichtbaar tenzij iemand een migratie schrijft die de view
herdefinieert. Er is geen generieke loop die "alle kolommen" meeneemt en er is geen `select *`
om per ongeluk in te vallen. Dit is het argument dat DoD 5 in fase 3 moet aantonen met een test
die de view-definitie of de engine-kolommenlijst controleert — geen test die "het gebeurt niet"
observeert.

Voorwaarde die het plan moet bewaken: **de opslag van eigen veldwaarden mag nooit in
`tier2_source`** (die staat wél in de view) en de view mag niet worden aangeraakt.

---

## 6. Eventnamen die al bestaan (`entity = 'brand'`)

Gemeten op `events(entity, action)`. ⚠️ De kolom heet **`action`**, niet `name` — zowel de
briefing als sprint 1.7 spreken van "eventnamen". Voor het bouwen: `logEvent(db, { entity,
entityId, action, actor, payload })` in `lib/repo/events.ts`.

Bestaande brand-acties: `brand_relation_status_changed`, `enrichment_started`,
`brand_template_downloaded`, `enrichment_published`, `brand_created_for_test`, `brand_deleted`,
`brand_created`, `brand_updated`, `disclosure_changed`, `brand_lifecycle_changed`.

Er is nog **geen** entity voor een velddefinitie. Fase 2 kiest de entity-naam; `entity_id` is
`uuid`, dus een velddefinitie moet een uuid-primaire sleutel hebben om er rechtstreeks aan te
kunnen hangen.

---

## 7. Wat fase 2 moet beslissen

1. **Waar de definities heen gaan** en of `excelColumns()` c.s. async worden of een parameter
   krijgen (Val 5) — de enige vraag die de zuiverheid van twee modules raakt.
2. **Of een eigen veld standaard in het merk-Excel hoort** (Val 2), met het `must`-risico erbij.
3. **Hoe het retour-pad een eigen veld wegschrijft** zonder `SCHRIJF_MAPPING` te veralgemenen
   tot "alles is schrijfbaar" (§1, de gevaarlijkste lezer).
4. **Hoe de meting gegarandeerd geldig is** — de JSONB-parameter-route uit Val 3 als
   uitgangspunt, met de `sql.raw`-guard als afschrikwekkend voorbeeld.
5. **Hoe verwijderen telt** vóór het wist, en welke events er precies zijn.
