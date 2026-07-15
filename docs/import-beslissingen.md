# Import-beslissingen (prijslijst-imports)

> Overgehaald uit Supabase `brink_import_decisions` (25 uitspraken, juni 2026) op
> 2026-07-14 — zie `docs/plan-datamodel-productspecs.md` O2. Dit zijn de vastgelegde
> spelregels voor het inladen van prijslijsten. **Actie:** `auto` = agent past zelf toe ·
> `escalate` = altijd eerst naar Timo/Eduard · `cleanup` = later opschonen, niet blokkerend.
> Alle regels staan op actief. Beslisser: Timo (2026-06-23/24).

## Globale regels (elke import)

| Regel | Uitspraak | Waarom | Actie |
|---|---|---|---|
| `prijs_btw` | Prijzen **excl. btw** aannemen, tenzij het bestand expliciet incl. zegt. | B2B-groothandellijsten zijn standaard excl. | auto |
| `items_zonder_prijs` | Producten zonder prijs (on demand / #N/A) **wél laden**, status `prijs_te_verifieren`. | Vindbaarheid > opschoning; prijs later. | auto |
| `supplier_ontbreekt` | Onbekende supplier: **aanmaken (naam-only)**, niet vragen. | Verplicht veld; adres/contact kan later. | auto |
| `code_whitespace` | Leading/trailing spaties in artikelcodes **trimmen** bij transfer. | Anders valse dubbelen/ongelijke codes. | auto |
| `group_header_sparse` | Modelnaam die alleen op de 1e variant staat: **forward-fillen**. | Elke variant hoort de modelnaam te krijgen. | auto |
| `footer_disclaimer` | Footer-/disclaimer-/versie-rijen zonder code+prijs **eruit filteren**. | Geen artikel; vervuilt de lijst. | auto |
| `non_products` | Logo/sample/display/marketing/brochure/tester/stalen: echte non-products **weg**; bij twijfel **houden + flaggen** (`prijs_te_verifieren`). | Alleen echte non-products weg. | auto |
| `varianten_apart` | Kleur/maat-varianten: **elke variant een eigen rij**, niet samenvoegen. | Les uit Artemide/Aromas. | auto |
| `korting_bron` | Inkoopkorting per merk komt uit `brands.standard_discount_pct`; bestaande merken niet vragen. | Korting is al vastgelegd. | auto |
| `prijs_kolom_default` | `selling_price_excl_vat` = de verkoop/lijst/RRP-prijs excl. btw; inkoop wordt berekend. | Standaardgeval. | auto |
| `prijs_retail_bij_beide` | Bron geeft inkoop én advies/retail/MSRP → **advies/retail wordt selling** (adviesprijs op de estimate, "definitieve prijs later"); inkoop volgt uit merkkorting. | Brink stuurt snel een estimate met adviesprijs. | auto |
| `dedup_deterministic` | Dubbele codes deterministisch dedupen: `DISTINCT ON code`, voorkeur rij mét EAN → hoogste prijs → naam → id. | Reproduceerbaar, geen willekeur. | auto |
| `merk_scope_check` | **Elke import**: check of het bestand een merk-kolom met >1 waarde heeft. Zo ja: alleen het merk in scope laden, rest apart/parkeren. | IAR-bestand had verstopt Good&Mojo naast RoMi → verkeerd merk+korting. | auto |
| `retro_scope_audit` | Retro-check alle raw-bestanden op verborgen tweede merken; kruisbesmetting rapporteren en corrigeren. | Nasleep van de IAR/Good&Mojo-mix. | auto |
| `nieuw_merk` | Nieuw merk zonder brand_code/korting → **escaleren** naar Timo/Eduard. | Korting is onderhandeld — commercieel feit, niet af te leiden. | escalate |
| `merk_taxonomie` | Sub-collectie eigen merk of onder hoofdmerk → **escaleren** naar Timo. | Catalogus-keuze, geen patroon. | escalate |
| `brandcode_collisions` | Dubbele brand_codes (L016 Sylvania+TossB; L158 Davide Groppi+Leucos) door Eduard laten ontdubbelen. Transfer sleutelt altijd op UUID, dus niet blokkerend. | Bestaande vervuiling; UUID is de echte sleutel. | escalate |

## Patroon-regels

| Regel | Scope | Uitspraak | Actie |
|---|---|---|---|
| `prijs_kolom_inkoop` | bron geeft alléén inkoop | `selling = inkoop / (1 − korting)` zodat de inkoop reproduceerbaar is (bevestigd voor Nordlux: 50% → ×2). **1e keer bij een nieuw merk: escaleren.** | escalate |
| `marset_staffel` | placeholder-SKU (XXX) met volumestaffel | 1 product op de 1-3-prijs, status `prijs_te_verifieren`, volledige staffel in description. | auto |
| `design_brand_filter` | dual-merken (meubels + licht: Muuto/Northern/Valerie/&Tradition-type) | HOUDEN = 'Lighting' incl. lamp-onderdelen (kappen, drivers, kabels, hang-componenten); WEG = meubels, woonaccessoires, POS/marketing. 0-prijs onderdelen → `prijs_te_verifieren`. Steekproef 50 (Aromas-les). | auto |

## Leverancier-specifiek

| Regel | Merk | Uitspraak | Actie |
|---|---|---|---|
| `goodmojo_parked` | Good & Mojo | **Geparkeerd** tot Eduard brand_code + korting levert. Betere bron: `brink_iaromi_raw WHERE Brand='Good&Mojo'` (908 rijen, vollediger dan het 42-rijen Overview-bestand). | escalate |
| `leucos_jj_collection` | Leucos | JJ Collection voorlopig **onder Leucos**, geflagd via source_list `leucos_jj_2026`; Eduard bevestigt later, re-taggen kan. | auto |
| `muuto_gross_prijs` | Muuto | "CONTRACT PRICE"-kolom in het Gross-bestand behandelen als bruto lijstprijs excl. btw → selling; korting 35%. Contract-file negeren. | auto |
| `lombardo_kabelvarianten` | Lombardo | ~32k kabellengte-varianten **nu niets weggooien** (vindbaarheid). Later opschoon-onderzoek: parametrische ruis → inkrimpen naar basisproduct + lengtebereik. | cleanup |
| `sylvania_subbrands` | Sylvania | Lumiance (105) teruggezet naar eigen merk (L062, 37%); Concord (1427) + Purchased brand (204) onder Sylvania gelaten (geen eigen merk/korting — geen prijsfout). Eventueel later Concord-merk met Eduard. | auto |
