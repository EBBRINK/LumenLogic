# Onderdeel: Merkrelaties & data-inwinning — FASE 1 (idee)

> Werkwijze: `docs/lumenlogic.md` — onderdeel-voor-onderdeel, drie fases. Dit is **fase 1
> (idee uitwerken)**. Nog niet bouwen; fase 2 (plannen) start pas na Timo's akkoord op de
> scope hieronder én zodra de blokkerende afhankelijkheid (data-buckets) is opgelost.
> Vastgelegd: 2026-07-14.

## Doel

Eén werkplek waarmee de persoon die het merkcontact doet, per merk ziet: **hebben we ze,
en welke data missen we nog** — plus twee uitgaande artefacten om de gaten te dichten:
een **bericht** naar het merk en een **Excel-template** dat het merk invult en terugstuurt.

## Gebruiker

Binnendienst / iemand bij Brink Licht die het klantcontact met de merken doet. Loopt onze
~430 merken/prijslijsten langs. Heeft overzicht nodig van wat we wél en niet hebben.

## Scope (vastgesteld met Timo, 2026-07-14)

- **De lijst** = onze ~430 merken (de bron-merken). Geen aparte wenslijst nu.
- **Excel** = één **generiek master-template** met alle marktinfo die we willen. Het merk mag
  weglaten wat voor hen niet van toepassing is. Niet per merk voorgevuld.
- **Contact (bellen/mailen)** = nog onbeslist. Outreach voorlopig **licht** houden: bericht +
  bijlage klaarzetten, niet automatisch versturen (er is nog geen mailprovider — Resend staat
  in de open punten van `lumenlogic.md`).

## ⚠️ Begripsknoop: "tier" betekent twee dingen

- **`disclosure_tier` (bestaand, `db/schema.ts`)** = hoevéél een merk óns laat tónen
  (tier1 = alles incl. prijs · tier2 = specs zichtbaar, prijs achter lead · tier3 = afgeschermd).
  Dit is een *toestemmings*-as.
- **Timo's "tier 1/2/3 + milieu-informatie"** = *categorieën data die wíj van een merk willen*
  (basis / technische specs / … / duurzaamheid). Een *compleetheids*-as.

Deze twee mogen in de UI/code **niet allebei "tier"** heten. Voorstel: de data-categorieën
"buckets" noemen, of een andere term die Timo kiest.

## ✅ Veldenlijst (definitief, Timo 2026-07-14) — blokker opgelost

> Bron: `docs/plan-datamodel-productspecs.md` (de database-chat) — dáár staat het volledige
> schema-ontwerp (nieuwe kolommen, prijslijst-historie, intern/extern-views). Deze kopie is
> voor de scorecard + het Excel-template.

Terminologie besloten: **"tier" blijft gereserveerd voor `disclosure_tier`** (toestemming).
De compleetheids-as heet **compleetheidsniveau**: `must / wanna / nice` (= XIS TIER 1/2/3,
maar dat woord niet in de UI). Veldgroepen hieronder = de **buckets** van de scorecard.

Legenda: **M/W/N** = must/wanna/nice · **⚙️** = matcher gebruikt dit · **🔒** = intern-only
(nooit in merk-Excel, nooit extern) · **📄** = hoort in het merk-Excel (merk levert aan).

| # | Bucket | Velden |
|---|---|---|
| 1 | Basis & identiteit | `supplier_article_code` M📄 · `ean_code` N📄 · `name_nl`/`name_en` M📄 · `description_nl`/`en` W📄 · `family` N📄 · `designer` N📄 · `category` M📄 · `etim_class` W📄 |
| 2 | Commercie | `list_price_excl_vat` M📄 · `purchase_price_excl_vat` W🔒 · merk-korting W🔒 · `stock`/`stock_reserved` N🔒 · `show_on_web`/`show_price_on_web` N🔒 |
| 3 | Afmetingen | `height/width/length/diameter_cm` W⚙️📄 · zaagmaten H/B/L/Ø N📄 |
| 4 | Uiterlijk | `color_1`/`material_1` W⚙️📄 · `color_2`/`material_2` N📄 |
| 5 | Lichtbron & fitting | `light_source` W⚙️📄 · `light_source_system` W📄 · `light_source_included` W📄 · `lamp_foot` W📄 · `lamp_category` W📄 · `max_wattage` W⚙️📄 |
| 6 | Fotometrie | `kelvin` W⚙️📄 · `lumen_output` W⚙️📄 · `cri` W⚙️📄 · `beam_angle` W⚙️📄 · `sdcm` W📄 · `efficacy` W📄 · `ugr` W📄 · `lifetime_rating` (L80B10@…) W📄 · `system_lumen`/`module_lumen` N📄 · `light_distribution` N📄 |
| 7 | Elektrisch / driver | `dimmable`/`dim_protocol` (DALI…) W⚙️📄 · `driver_included` W📄 · `system_wattage`/`led_wattage` W📄 · `drive_current`/`forward_voltage`/`nominal_voltage` W📄 · `driver_type` W📄 · `power_factor`/`standby_power` N📄 |
| 8 | Bescherming & conformiteit | `ip_value` W⚙️📄 · `directionable` W📄 · `protection_class` (I/II/III) W📄 · `ik_rating` W📄 · `energy_label` W📄 · `emergency` N📄 · `ambient_temp`/`flammable_mount` N📄 |
| 9 | Documentatie / links | `url_datasheet` W📄 · `url_supplier_page` W📄 · `url_install_manual` W📄 · `url_photometry` (IES/LDT) N📄 · `url_declaration` (CE/DoC) N📄 |
| 10 | Duurzaamheid / milieu | `warranty_months` W📄 · `repairability` W📄 · `epd_lifetime_hours` W📄 · `country_of_origin` W📄 |

**Merk-Excel:** alle 📄-velden, gegroepeerd per bucket; 🔒-velden weglaten (intern/commercieel).
Merk mag niet-toepasselijke velden leeglaten — één generiek master-template.
**Scorecard:** compleetheid per bucket, gewogen op M/W/N. Must compleet = groen, wanna = half,
nice = bonus. Deze definitie **config-gedreven** vastleggen (één bron voor scorecard + Excel).

## Nulmeting — bestaand vs. wens

1. **Merkenlijst** — bestaat op `/admin/merken`, maar toont disclosure-tier +
   per-veld-zichtbaarheid, niet relatiestatus of "willen we ze". ⚠️ mist relatie-laag.
2. **Prijslijst aanwezig/geldig** — `/data/prijslijsten` toont geldigheid (verloopt/verlopen).
   ⚠️ geen per-merk intake-overzicht "lijst aanwezig ja/nee".
3. **Hoeveel data per merk** — verrijkings-provenance (`products.tier2Source`) bestaat, maar
   nergens geaggregeerd tot een **compleetheids-scorecard per merk**. ⚠️ mist.
4. **Relatiestatus / CRM** (niet benaderd → benaderd → data terug → verwerkt). ❌ bestaat niet.
5. **Bericht met wat we missen**. ❌ bestaat niet.
6. **Generiek Excel-template**. ❌ bestaat niet.

Basis (merken, prijslijsten, verrijkingsdata) is er; de **relatie-/inwinnings-laag eroverheen**
+ de twee uitgaande artefacten ontbreken.

## Wat nú al buildbaar is (bucket-onafhankelijk)

- **Merkrelatie-overzicht**: de ~430 merken met een **relatiestatus**, een indicator
  "prijslijst aanwezig + geldig" (data hebben we al), en ruimte voor contact/notities.
- **Compleetheids-scorecard**: skelet dat buckets/velden uit config leest (leeg tot de
  veldenlijst er is).
- **Excel-generator**: scaffold; kolommen = de config-veldenlijst (definitief te vullen later).

## Open besluiten voor fase 2

- Term voor de data-categorieën (niet "tier").
- Set relatiestatussen (voorstel: `niet benaderd · benaderd · wacht op data · data ontvangen ·
  verwerkt · afgewezen`).
- Waar dit onderdeel woont in de nav (waarschijnlijk onder `/data` of een nieuw `/merken`).
- Nieuwe tabel(len): `brand_relations` (status, laatste contact, notitie) + hoe de
  compleetheid berekend wordt (view over products/tier2Source per merk).

---

# FASE 2 — Implementatieplan (plan-agent + kritische reviewer, 2026-07-14)

> Opgesteld door een plan-agent, hard gereviewd door een onafhankelijke reviewer tegen de
> echte codebase; reviewbevindingen zijn hieronder verwerkt. **Wacht op Timo's akkoord
> vóór fase 3 (bouwen).**

## Kernbeslissingen

- **K1 — Relatiestatussen** (zes): `niet_benaderd → benaderd → wacht_op_data →
  data_ontvangen → verwerkt`, plus eindstand `afgewezen`. "benaderd" = eerste contact,
  "wacht_op_data" = merk heeft toegezegd. "Geen reactie" is géén status maar een filter
  (drempel X dagen sinds laatste contact — constante in `lib/field-catalog.ts`, niet inline).
  Status vrij muteerbaar (geen state-machine), elke wijziging gelogd (regel 5).
- **K2 — Datamodel**: één tabel `brand_relations`, 1-op-1 met `brands`. **Reads zijn puur
  virtueel** (LEFT JOIN + COALESCE naar `niet_benaderd` — lezen schrijft nooit); alleen
  `upsertBrandRelation` schrijft, via `INSERT … ON CONFLICT (brand_id) DO UPDATE`
  (race-vrij). Contactpersoon/e-mail op de relatie (niet op `suppliers` — ander soort
  contact). Geen backfill, geen contact-log-tabel in v1.
- **K3 — Nav**: `/data/merkrelaties` (vijfde kaart op `/data`; badge = aantal merken met
  status `data_ontvangen` = "werk te verwerken"). `/admin/merken` blijft de toestemmings-as
  (disclosure); kruislinks tussen beide. Twee assen ook ruimtelijk gescheiden.
- **K4 — Field-catalog** `lib/field-catalog.ts`: beschrijft ALLE velden uit de veldenlijst;
  v1-scorecard meet alleen velden met een bestaande `products`-kolom (`measure.kind:
  "column"`), de rest is grijs "nog niet meetbaar". Geen products-migratie in v1; zodra
  data binnenkomt wordt per veld een kolom toegevoegd en telt het veld automatisch mee.
  **Veldnaam-mapping (reviewer, blokkerend punt — opgelost):** samengestelde plan-velden
  worden gesplitst en expliciet gemapt op de echte drizzle-kolommen:
  `dimmable` → kolom `dimmable`, `dim_protocol` → none; `name_nl` → kolom `name`,
  `name_en` → none; `description_nl` → kolom `description`, `description_en` → none;
  `category` → kolom `category_path`. Wél meetbaar (niet vergeten): `supplier_article_code`,
  `driver_included`, `directionable`, en heel bucket 10 (`warranty_months`, `repairability`,
  `epd_lifetime_hours`, `country_of_origin`). Precieze grijs-stand v1: bucket 9 volledig
  grijs; bucket 6 meet 4 velden, 7 meet 2, 8 meet 2.
  `list_price_excl_vat` → `measure.kind: "price"`: `EXISTS`-check op `prices` **mét
  `valid_until >= current_date`** (reviewer: anders "prijs ✓" naast "lijst verlopen");
  het bedrag wordt nooit gebruikt (regel 2).
- **K5 — Excel-template = CSV** (geen xlsx-dependency): UTF-8 mét BOM, `;`-scheiding
  (NL-Excel), bestandsnaam `merkdata-template-brinklicht.csv`. Structuur: bucketgroep-rij +
  veldnamen-rij + instructie-rij. Alleen 📄-velden; generator filtert op `!internalOnly`;
  **negatieve test**: geen enkel 🔒-veld in de output. Upgrade naar echt .xlsx kan later
  (generator leest alleen de catalog).
- **K6 — Bericht klaarzetten**: servergegenereerde NL-tekst (aanhef, prijslijst-status,
  buckets met laagste dekking, verwijzing naar template) in `<textarea readonly>` +
  kopieerknop. Geen mailverzending. **`buildBrandMessage` filtert óók op `!internalOnly`
  en krijgt dezelfde negatieve 🔒-assert als de CSV** (reviewer: lek-preventie).
- **K7 — Events** (regel 5, entity `brand`): `brand_relation_status_changed` alléén bij
  echte statuswijziging, payload `{from, to}`; `brand_relation_updated` voor overige
  veldwijzigingen (beide kunnen uit één save komen); `brand_template_downloaded`;
  `brand_message_prepared`.
- **K8 — Dubbele merken** (reviewer): `brands.brand_code` is niet uniek (bv. L052 dubbel) →
  in het overzicht een badge "dubbele code" bij merken die een code delen, zodat niemand
  dubbel belt. Merge-tooling is later.

## Schema (nieuw in `db/schema.ts`)

`pgEnum brand_relation_status` (6 waarden) + tabel `brand_relations`: `id` uuid pk,
`brand_id` FK→brands (cascade, uniqueIndex), `status` default `niet_benaderd`,
`contact_name`, `contact_email`, `last_contact_at` (date), `notes`, timestamps.

**Migratie `0007_merkrelaties.sql` — handgeschreven** (reviewer: snapshots stoppen bij
0003, `drizzle-kit generate` genereert niet schoon; 0004–0006 zijn ook handgeschreven).
Puur additief + journal-entry; snapshot-gat noteren in HANDOVER.md.

## Repo-laag (`lib/repo/brand-relations.ts`)

- `listBrandRelations(db)` — brands LEFT JOIN brand_relations LEFT JOIN price_lists;
  prijslijst-indicator (`aanwezig_geldig/verloopt_binnenkort/verlopen/ontbreekt`) deelt
  logica met `listPriceListStatus` (`lib/repo/enrichment.ts`), niet dupliceren.
- `upsertBrandRelation(db, brandId, patch, actor)` — `onConflictDoUpdate` + events (K7).
- `getBrandCompleteness(db, brandId)` / `getAllBrandCompleteness(db)` — één SQL met
  `count(*) filter (where <col> is not null)` per meetbaar veld, gegenereerd uit
  `measurableFields()`; GROUP BY voor alle merken (geen N+1 zoals `/admin/merken` nu doet).
- `buildBrandMessage(...)` (pure functie) · `buildMasterTemplateCsv()` in
  `lib/excel-template.ts` (pure functie).
- Score: `bucketScore` (pure functie in de catalog-module). Groen = alle must-velden ≥
  drempel (constante `MUST_DREMPEL = 0.9`, door Timo bijstelbaar; op de detailpagina
  uitgelegd via tooltip — reviewer), amber = deels, nice = bonus.

## Bouwstappen (kleine commits; elke UI-stap eindigt met white-box RSC-test + screenshots light/dark × mobile/desktop)

1. **Field-catalog + scorefunctie** — `lib/field-catalog.ts` + tests. Asserts: 10 buckets;
   elk 🔒-veld `inExcel: false`; alle `measure.kind:"column"`-velden bestaan écht als
   drizzle-kolom (via `getTableColumns(products)`, geen handgetypte lijst); `bucketScore`-
   randgevallen (0 producten, alles gevuld, alleen nice).
2. **Migratie 0007 + repo-basis** — schema + handgeschreven migratie + `listBrandRelations`
   /`upsertBrandRelation` + PGlite-tests (default zonder rij; upsert-round-trip; event met
   `{from,to}` bij statuswijziging; prijslijst-indicator geldig/verlopen/ontbreekt).
3. **Overzichtspagina `/data/merkrelaties`** — page (RSC, `requireSession`) + server
   actions + `components/data/brand-relations-table.tsx` (statusfilter, "geen reactie"-
   filter, zoeken, inline status-select, prijslijst-badge, dubbele-code-badge) + vijfde
   kaart op `/data`. RSC-test + screenshots.
4. **Compleetheids-aggregatie** — `getBrandCompleteness`/`getAllBrandCompleteness` +
   mini-scorecard-kolom (10 blokjes) in het overzicht. Tests: verwachte counts/kleuren op
   seed-data; prijs-meting verandert niet mee met het bedrag (regel 2-assert); beide
   codepaden geven identieke cijfers voor hetzelfde merk (reviewer).
5. **Detailpagina `/data/merkrelaties/[brandId]`** — volledige scorecard (per veld
   dekkings-%, grijs = nog niet meetbaar, tooltip met groen-definitie), relatievelden
   bewerken, kruislink `/admin/merken`. Eén `getBrandCompleteness`-call (geen per-bucket-
   queries). RSC-test + screenshots.
6. **Template-download** — `lib/excel-template.ts` + `app/data/merkrelaties/template/
   route.ts` (patroon `app/projecten/[id]/offerte/pdf/route.ts`, attachment) + knop op
   overzicht én detail + event. Tests: BOM + `;` op de eerste bytes; groeps-/kop-/
   instructie-rij; **negatief: geen 🔒-veld**; kolomvolgorde = bucketvolgorde.
7. **Bericht klaarzetten** — `buildBrandMessage` (unit-tests: geen prijslijst / verlopen /
   alles compleet / **geen 🔒-veld in de tekst**) + UI-blok (textarea + kopieerknop) +
   event. Screenshots.
8. **Afronding** — HANDOVER.md (drempel 90%, grijze velden, CSV-keuze, snapshot-gat,
   dubbele brand_codes, **retour-pad ontbreekt bewust** — hoe ingevulde templates het
   systeem in komen is een vervolgonderdeel, anders is de loop dood), `bun vitest run` +
   `bunx tsc --noEmit` groen, screenshots bekeken.

Volgorde: 1→2→3→4→5; 6 en 7 parallel na 4/5.

## Besluiten Timo (2026-07-14) — plan akkoord, fase 3 mag starten

1. **Must-drempel: strikt 100% = donkergroen.** Daaronder werken we met een **gradient**
   (kleurverloop naar dekkingsgraad) i.p.v. een harde 90%-knip. `bucketScore` retourneert
   dus de exacte dekking per niveau; de UI kleurt op een schaal (donkergroen = 100% must).
2. **Retour-pad** (ingevuld template uploaden/verwerken) = bevestigd als later vervolgonderdeel.
3. **Template = écht .xlsx, nú al.** Timo geeft akkoord op één nieuwe dependency (xlsx-lib,
   voorstel `exceljs`) — stack-overleg gedekt. Structuur blijft: kolommen per bucket
   (groepsrij), veldnamen-rij, instructie-rij; alleen 📄-velden; negatieve 🔒-test blijft.
   Bestandsnaam `merkdata-template-brinklicht.xlsx`.

**Afstemming met `docs/plan-datamodel-productspecs.md`** (het datamodel-onderdeel, nog fase 1):
dat plan voegt t.z.t. alle ➕-kolommen toe (B4). Tot die migratie er is meet de scorecard
alleen bestaande kolommen; daarna is het invullen van `measure.column` in de field-catalog
voldoende om nieuwe velden mee te laten tellen. Geen dubbele migraties vanuit dit onderdeel.
