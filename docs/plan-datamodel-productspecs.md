# Onderdeel: Datamodel & productspecs — FASE 1 (idee)

> Werkwijze: `docs/lumenlogic.md` — onderdeel-voor-onderdeel, drie fases. Dit is **fase 1
> (idee uitwerken)**, uitgewerkt in de "database-chat" met Timo. Nog niet bouwen; fase 2
> (plannen) start na Timo's akkoord op de open punten onderaan. Vastgelegd: 2026-07-14.
> De veldenlijst hieronder is dezelfde als in `docs/plan-merkrelaties.md` (scorecard/Excel);
> dít document is de bron voor het databaseschema.

## Aanleiding & grote ontdekking

Het plan was "Supabase opschonen en naar Neon migreren". Bij inspectie bleek: **Neon heeft
alles al** — 211.310 producten, 436 merken, 26 leveranciers, 152 categorieën, 210k prijzen —
en is zelfs verser (Neon geladen 2026-07-02, Supabase laatst bijgewerkt 2026-06-24). Er is
dus **geen migratie nodig**; Neon is al de bron van waarheid.

## Besluiten (Timo, 2026-07-14)

- **B1 — Neon is de enige werkdatabase.** Supabase-project (`Thursd Chatbot`, ref
  `uvmeytxejlzvdgjgthmr`) blijft **onaangeroerd staan als archief** — niets meer verwijderen,
  niets meer bijwerken. Timo hernoemt het project in het Supabase-dashboard naar "Brinklicht".
- **B2 — Thursd-restanten verwijderd** *(uitgevoerd 2026-07-14)*: de vier `(THURSD!)_`-tabellen
  (ingestion_state/runs, embeddings 13.668 rijen, workflow_runs) zijn gedropt via migratie
  `drop_thursd_chatbot_tables`.
- **B3 — Prijslijst-historie zonder tweede database** (onderbouwd met deep research, zie
  "Prijslijst-historie" hieronder). Timo's eis: de hot DB niet laten vervuilen met miljoenen
  verouderde prijsregels. Oplossing: snapshot-op-offerte + actueel-only `prices` +
  archieftabel in dezelfde DB. **Geen** tweede Neon-project/branch als archief (overkill op
  deze schaal; fdw-latency + beheerslast).
- **B4 — Volledig schema nú, gefaseerd vullen.** `products` krijgt meteen álle velden uit de
  veldcatalogus (must/wanna/nice); we vullen ze pas als data binnenkomt. Zelfde patroon als
  de duurzaamheidsvelden die al leeg klaarstaan.
- **B5 — ETIM alleen als haakje.** Geen ombouw naar ETIM-veldcodes (onleesbaar voor Brink);
  Brink/XIS-namen blijven. Eén veld `etim_class` als aanknopingspunt mocht een leverancier
  ooit ETIM-data leveren. **Connecting the Dots/PDL-sync is geschrapt.**
- **B6 — Geld & zichtbaarheid, verduidelijkt.** Prijs (ook inkoop) hoort wél in de data —
  essentieel voor de estimate. "Geld beïnvloedt nooit de ranking" (ijzeren regel 2) betekent:
  geen supplier-deal die een product omhoog duwt; de matcher draait uitsluitend op
  technische velden. Dáárnaast: **intern zien ≠ extern zien** — inkoopprijs/korting is
  intern-only en zit fysiek nooit in de externe views.

## Terminologie (afgestemd met plan-merkrelaties.md)

- **`disclosure_tier`** (bestaand) = toestemmings-as: wat een merk óns laat tonen.
- **Compleetheidsniveau `must / wanna / nice`** (= XIS TIER 1/2/3) = compleetheids-as: hoe
  belangrijk het is dat wíj een veld hebben. Het woord "tier" niet hergebruiken in UI/code.

## Het 5-lagen datamodel

Legenda: ✅ bestaat · 🔧 wijzigt · ➕ nieuw

### Laag 1 — Referentie (stamdata)
`brands` (436, incl. commerciële info + `disclosure_tier`) ✅ · `suppliers` (26) ✅ ·
`categories` (152, 3-niveau XIS-hiërarchie) ✅

### Laag 2 — Producten = "de ene echte lijst" (matching-kant)
`products` — één rij per écht artikel, overleeft prijslijst na prijslijst.
- 🔧 **Natuurlijke sleutel `(brand_id, supplier_article_code)` wordt UNIEK** — nu alleen een
  UUID; zonder deze sleutel kan een herimport dubbelen maken. *(open punt O1: bevestigen dat
  dit dé identiteit is, en niet `article_code`/XIS A1.)*
- Specs volgens de veldcatalogus hieronder; nullable, `tier2_source` (jsonb) houdt per veld
  de herkomst bij (geparsed/LLM/leverancier). ✅
- Geen prijs in deze tabel; prijs leeft in laag 3. ✅

### Laag 3 — Commercie (strikt gescheiden van matching)
- `price_lists` ✅ — één per merk, **verplichte** `valid_from`/`valid_until` (drijft regel 3).
- `prices` 🔧 gedrag — **alleen actueel**: groeit nooit voorbij de huidige catalogus (~210k).
- `price_tiers` ✅ — staffels.
- `archive.prices_archive` ➕ — verlopen prijsregels, apart schema, append-only (SCD type 4).
  Queryable, maar buiten de hete werkset.

### Laag 4 — Offerte bevriest zichzelf (auditwaarborg)
`quote_lines` snapshot al `product_name` + `unit_price` + `line_total`; `quotes.frozen_at`
zet de estimate op slot. 🔧 **Erbij: `price_list_id` + `source_list_date`** — dan documenteert
elke offerte zelf uit welke lijst z'n prijs kwam, onafhankelijk van archief of actueel.

### Laag 5 — Import & controlespoor
- `import_runs` ✅ (incl. `raw_markdown`-controlespoor).
- `import_decisions` ➕ — 25 vastgelegde import-uitspraken (vraag/ruling/rationale) overhalen
  uit Supabase. *(open punt O2: als Neon-tabel of als repo-doc.)*
- 24× `brink_*_raw` (~300k rijen) → **niet** als levende tabellen; als CSV/dump archiveren
  in `data/` (read-only, buiten git). `werkbonnen` (5 rijen) hoort niet bij dit project.

## Prijslijst-historie — hoe een nieuwe lijst binnenkomt

1. Inkomende regels matchen op `(brand_id, supplier_article_code)` → bestaande producten
   bijwerken/aanvullen (nooit dupliceren).
2. Oude prijsregels van dat merk → `archive.prices_archive`.
3. Nieuwe regels in `prices`; oude `price_lists`-rij markeren als vervangen.

De view `visible_products` (product ⨝ prices ⨝ price_lists, geldig-vandaag) regelt regel 3
al centraal: verlopen lijst = product onzichtbaar in álle zoekresultaten.

Waarom dit genoeg is (research-conclusies, 2026-07-14): elke serieuze webshop/ERP bevriest de
prijs op de order/offerteregel (Workarea, Odoo, Medusa); Postgres-pijn begint pas bij
miljarden rijen, dit blijft laag-miljoenen; Neon tiert koude data zelf naar S3 en rekent
$0,35/GB-maand — een tweede archief-DB lost een niet-bestaand probleem duur op. Mocht
`prices_archive` over jaren echt groot worden: dán pas partitioneren (pg_partman) of naar
Parquet exporteren.

## Veldcatalogus `products`

Bron: Menno's `XIS_velden_per_productgroep.xlsx` (wit = bestaat in XIS, geel = voorstel,
met prioriteit) + `Product data entry in XIS (6).xlsx` (XIS TIER 1/2/3 = must/wanna/nice).
Menno's nieuwe velden volgen de armatuur-industriestandaard (ETIM-achtig) — bewust zo houden.

Legenda: **M/W/N** = must/wanna/nice · **⚙️** = matcher (tolerantietabel) · **🔒** =
intern-only (nooit in merk-Excel of externe views) · **➕** = nieuwe kolom.

| # | Bucket | Velden |
|---|---|---|
| 1 | Basis & identiteit | `article_code` M (XIS A1) · `supplier_article_code` M (nat. sleutel) · `brand_id`/`supplier_id`/`category_id` M · `name`(+`name_en`➕) M · `description`(+`description_en`➕) W · `ean_code` N➕ · `family` N➕ · `designer` N➕ · `etim_class` W➕ |
| 2 | Commercie | `selling_price_excl_vat` M (via `prices`) · `purchase_price_excl_vat` W🔒 · merk-korting W🔒 (uit `brands`) · `stock`/`stock_reserved` N🔒➕ · `show_on_web`/`show_price_on_web` N🔒➕ |
| 3 | Afmetingen | `height/width/length/diameter_cm` W⚙️ · `cutting_size_h/w/l/d` N➕ (zaagmaten) |
| 4 | Uiterlijk | `color_1`/`material_1` W⚙️ · `color_2`/`material_2` N➕ |
| 5 | Lichtbron & fitting | `light_source` W⚙️ · `light_source_system` W➕ · `light_source_included` W➕ · `lamp_foot` W➕ · `lamp_category` W➕ · `max_wattage` W⚙️ |
| 6 | Fotometrie | `kelvin` W⚙️ · `lumen_output` W⚙️ · `cri` W⚙️ · `beam_angle` W⚙️ · `sdcm` W➕ · `efficacy` W➕ (lm/W) · `ugr` W➕ · `lifetime_rating` W➕ (L80B10@u) · `system_lumen`/`module_lumen` N➕ · `light_distribution` N➕ |
| 7 | Elektrisch / driver | `dimmable` W⚙️ · `dim_protocol` W➕ (DALI/DALI-2/1-10V/fase/Casambi) · `driver_included` W · `system_wattage`/`led_wattage` W➕ · `drive_current`/`forward_voltage`/`nominal_voltage` W➕ · `driver_type` W➕ · `power_factor`/`standby_power` N➕ |
| 8 | Bescherming & conformiteit | `ip_value` W⚙️ · `directionable` W · `protection_class` W➕ (I/II/III) · `ik_rating` W➕ · `energy_label` W➕ · `emergency` N➕ (nood) · `ambient_temp`/`flammable_mount` N➕ |
| 9 | Documentatie / links | `url_datasheet` W➕ · `url_supplier_page` W➕ · `url_install_manual` W➕ · `url_photometry` N➕ (IES/LDT) · `url_declaration` N➕ (CE/DoC) |
| 10 | Duurzaamheid / milieu | `warranty_months` W · `repairability` W · `epd_lifetime_hours` W · `country_of_origin` W (bestaan al, leeg) |

## Intern vs. extern — afdwinging

Eén `products`-tabel + de bestaande views:
- **`products`** (alles, incl. 🔒) → alleen intern, achter login (calculatie/estimate).
- **`visible_products`** ✅ → specs + verkoopprijs, gated op geldige prijslijst.
- **`visible_specs`** ✅ → specs zónder prijs (disclosure/portaal-kant).

🔒-velden (inkoopprijs, korting, voorraad, webvlaggen) komen in geen van beide externe views.

## Open punten (akkoord nodig vóór fase 2)

- **O1** — Natuurlijke sleutel: is `(brand_id, supplier_article_code)` dé identiteit van een
  artikel, of het interne `article_code` (XIS A1)?
- **O2** — `import_decisions`: als kleine Neon-tabel (import-code kan ze raadplegen) of als
  repo-doc `docs/import-beslissingen.md`?
- **O3** — Verloopt een prijslijst zónder opvolger: prijsregels meteen archiveren, of in
  `prices` laten staan tot de vervangende lijst er is? (Zichtbaarheid is in beide gevallen
  al dicht via de view; dit gaat alleen over waar de rijen wonen.)
- **O4** — Raw-archief: `brink_*_raw` exporteren naar `data/archief/` (read-only, buiten
  git) en daarna in Supabase laten staan zoals alles daar (B1) — akkoord?
- **O5** — `werkbonnen` (5 rijen, Supabase): bevestigen dat die niet bij Lumen Logic hoort.

## FASE 3 — GEBOUWD (2026-07-14, Timo's akkoord "alles doen")

Open punten door Claude beslist: **O1** = `(brand_id, supplier_article_code)` (dedupe-check
op productie: 0 duplicaten, 0 lege waarden). **O2** = repo-doc (`docs/import-beslissingen.md`).
**O3** = regels blijven in `prices` tot een opvolger komt (zichtbaarheid is al dicht via de
view; archiveren gebeurt bij vervanging). **O4** = raw-tabellen NIET exporteren — ze staan
al veilig in het onaangeroerde Supabase-archief (B1); export naar `data/archief/` kan altijd
nog. **O5** = `werkbonnen` blijft onaangeroerd in Supabase.

1. ✅ Migratie `0007_datamodel_productspecs.sql` — toegepast op Neon (19 statements):
   unieke index `products_brand_sac_uniq`; alle veldcatalogus-kolommen (buckets 1–9);
   `prices.purchase_price` (🔒); `price_lists.replaced_at` + partiële unique
   `price_lists_brand_active_uniq` (één ACTIEVE lijst per merk, vervangen lijsten blijven);
   `archive`-schema + `archive.prices_archive`; `quote_lines.price_list_id` +
   `source_list_date`.
2. ✅ `db/schema.ts` in sync (incl. `pgSchema("archive")`); `db/test-db.ts` draait 0007 mee.
3. ✅ `lib/repo/price-archive.ts` — `archivePriceList` + `replacePriceList` (archiveert oud,
   maakt nieuw actief, logt events `price_list_archived`/`price_list_created`).
4. ✅ `generateQuote` (lib/repo/dossiers.ts) klikt prijsherkomst vast: `price_list_id` +
   `source_list_date` per regel (alleen bij catalogusprijs; dagprijs I-04 bewust zonder).
5. ✅ `docs/import-beslissingen.md` — 25 uitspraken uit Supabase overgehaald.
6. ✅ Tests: `lib/repo/price-archive.test.ts` (archief-verhuizing, vervanging, natuurlijke
   sleutel weigert duplicaat). Suite: 402 tests groen (46 files), `bunx tsc --noEmit` schoon.
7. ⏳ Supabase-project hernoemen naar "Brinklicht" (Timo, dashboard — kan Claude niet).
