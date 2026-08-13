# Goal: bulkimport van 50 brand-Excels via een CLI-script

_Plan ter beoordeling, 12 aug 2026. Nog niets gebouwd, niets geïmporteerd._
_Bronmateriaal: de nachtrun van 12 aug (LEVERSTAND.md, uit-alle/, notities-alle/, bron-alle/), in een werkmap buiten deze repo._
_Besluiten van Timo (12 aug): CLI voor de bulk · volledig vervangen · geldig-van uit de brón (regels hieronder) · category hard afwijzen per bestand._

## 1. De route: een bun-script, niet de UI

**`scripts/bulkimport-branddata.ts`**, naar het model van `scripts/import.ts` en
`scripts/cleanup-testdata.ts`. Waarom niet de (omgebouwde) UI-route:

- De server action is byte-gecapt (3 MB, `components/data/template-upload-limits.ts:16`,
  `bodySizeLimit` 4 MB) en timeout-begrensd; de meting van 11 aug (Delta Light, 18.670
  rijen) stierf op staging-jsonb + voorstelscherm. Intra is 42× dat geval.
- Alles wat het script nodig heeft is al CLI-bruikbaar: `validateFilledTemplateXlsx` is
  puur (geen imports uit db/ of app/, `lib/excel-validate.ts:8-10`), de repo-laag neemt
  `db` als parameter, en `db/client.ts` is expliciet "voor de app (RSC + scripts)".
- Alleen een CLI kan een transactie per merk draaien: neon-http gooit op
  `db.transaction()` (repo-brede regel), maar `scripts/cleanup-testdata.ts:245-252`
  laat precies zien hoe: dynamisch de websocket-driver (`Pool` +
  `drizzle-orm/neon-serverless`) laden, buiten bereik van app en tests.

Het goal-doc `docs/goal-template-upload-direct-import.md` (UI-ombouw) blijft staan als
apart, later werk voor het dagelijkse pad; de rij-cap-discussie daar is voor de bulk
irrelevant geworden.

### Wat het script per merk doet

1. **Merk opzoeken**: slug → brandId via een expliciete mappingtabel in het script
   (slug is níét uniek, `lib/repo/brands.ts:71-80`; en `scripts/import.ts:48` normaliseert
   anders dan `brands.ts:76` — diakriet-merken kunnen afwijken). De dry-run print de
   mapping; elke slug moet exact één rij opleveren, anders weigeren.
2. **Valideren**: `validateFilledTemplateXlsx` met de echte `fieldCatalog` en
   `knownArticleCodes` van het merk. Elke afwijzing = merk overslaan + rapport.
3. **Category hard valideren** (nieuw — bestaat nergens): resolver die
   `categories.fullPathNl` opbouwt (separator ` >> `, 1–3 niveaus,
   `lib/repo/equivalence.ts:71-75`) en élk pad in het bestand exact matcht.
   Eén onbekend pad = héél bestand geweigerd, met de lijst afwijkende paden.
   Bonus t.o.v. het template-pad: we zetten ook `category_id` (FK), niet alleen het
   tekstpad — `lib/template-diff.ts:50` liet dat liggen.
4. **Prijsdekking-poort** (nieuw, belangrijk): percentage rijen met een prijs. Onder een
   drempel (voorstel: < 50%) → merk geweigerd. Reden: vervangen zonder prijzen archiveert
   de oude prijsregels en maakt via `visible_products` het hele merk onzichtbaar —
   dat mag alleen een bewuste keuze zijn, geen bijeffect (zie h-fele hieronder).
5. **Vervangen, in één transactie per merk** (websocket-driver):
   - producten upserten op `(brand_id, supplier_article_code)` (de sleutel die
     `applyTemplateProposal` ook gebruikt, `lib/repo/template-return.ts:497`), álle
     66 velden uit het bestand leidend, leeg = wissen;
   - `replacePriceList` (`lib/repo/price-archive.ts:69`): oude lijst → archief
     (regels naar `archive.prices_archive`, `replaced_at` gezet), nieuwe lijst met de
     goedgekeurde naam/geldig-van/geldig-tot;
   - prijsregels batch-inserten (700 per statement, patroon `scripts/import.ts:174`);
   - producten die niet in het bestand staan raken we niet aan: ze verliezen hun
     prijsregel en vallen daarmee automatisch uit `visible_products` — precies de
     gekozen vervang-semantiek, centraal afgedwongen door de view.
   NB: `applyTemplateProposal` zelf hergebruiken we niet — dat is een
   per-veld-goedkeurmotor met stale-guard, gebouwd voor het tegenovergestelde doel.
6. **Loggen** (ijzeren regel 5, zonder de events-tabel op te blazen):
   - 1 `bulk_import_started` / `bulk_import_finished` per merk met alle tellingen
     (nieuw, gewijzigd, geleegd, prijsregels, onzichtbaar-geworden);
   - per gewijzigd bestaand product 1 event met alleen de gewijzigde velden {old,new}
     (patroon `product_fields_applied`), **batch-geïnsert** — `logEvent` doet nu één
     roundtrip per event en dat is over neon de bottleneck bij 1,3M rijen;
   - voor nieuwe producten géén 790k losse events: de prijslijst-id + tellingen in het
     samenvattende event zijn het spoor; het bestand zelf is het brondocument.
   Afwijking van het bestaande patroon — als je per nieuw product tóch een event wilt,
   zeg het, dan wordt het een batched insert en accepteren we de omvang.
7. **Manifest naar schijf**: per merk een JSON buiten de database (run-uitkomst,
   tellingen, oude/nieuwe prijslijst-id, aangemaakte product-ids). Les uit de
   Neon-branch-ervaring: leg uitkomsten buiten de database vast.

Dry-run is default (zoals `cleanup-testdata`); `--apply` schrijft, `--merk <slug>`
beperkt tot één merk, `--rollback <slug>` zie §4.

### Intra en Zora

- **Intra (790k rijen)**: wél importeren, via hetzelfde script. Eén transactie van
  ~2.300 batch-statements moet Neon aankunnen, maar dit is onbewezen terrein — daarom
  draait Intra als **laatste**, en heeft het script een vluchtweg: `--geen-transactie`
  valt terug op idempotente upserts (herstartbaar, `onConflictDoUpdate` op de natuurlijke
  sleutel) met de prijslijst-flip als állerlaatste stap, zodat een afgebroken run niets
  zichtbaars verandert. Open vraag vooraf (§6): is 790k rijen voor één merk überhaupt
  gewenst in de catalogus, of is dit een configuratie-explosie die de matcher en de UI
  gaat vertragen? Dat wil ik eerst gemeten hebben.
- **Zora: niet importeren.** De notitie is ondubbelzinnig: het bronbestand is een
  NEKO Lighting-lijst (0× "Zora" in het hele bestand, 151k rijen tegenover 429
  Zora-producten in XIS). Eerst moet jij vaststellen of dit bestand bij die leverancier
  hoort. Tot die tijd staat zora op de weigerlijst in het script zelf, niet alleen in
  dit document. **Besluit Timo 12 aug: zora blijft buiten deze hele run** tot het
  NEKO-raadsel is uitgezocht; de run gaat dus over 49 bestanden.

## Modelverdeling (bouwsessie)

Bouwen en importeren: **Sonnet**. Alleen escaleren naar Opus waar Sonnet aantoonbaar
vastloopt (bijv. de rollback-logica of een onverwachte Neon-storing tijdens Intra) —
en dat dan melden. Het plannen is gedaan; dit document is de spec.

## 2. Prijslijst-metadata (jouw regels, geoperationaliseerd)

Per merk, in deze volgorde: expliciete geldig-vanaf ín het bestand (staat voor een
aantal merken al in `notities-alle/`) → datum/jaar in de bronbestandsnaam (alleen
jaartal = 1 januari) → documentdatum in XIS. `geldig-tot = geldig-van + 12 maanden`,
bewust: de 17 oude lijsten (Krea 2011, Prandina 2012, Philips 2014, Oligo 2015,
Solid 2016, Osram 2017, …) landen dan meteen als **verlopen** en zijn dus na import
onzichtbaar tot er een actuele lijst is — `PriceListExpiryNotice` is daar het signaal.
Naam = `<merk> prijslijst <bronjaar>`.

De acht zonder jaartal in de bestandsnaam (molto-luce, dcw-ditions, brokis,
solid-lighting, zora, cini-nils, nuura, royal-botania) zoek ik op in bestand of XIS;
brokis staat al vast (geldig vanaf 2025-04-08, uit de notitie). Liever leeg (= merk
niet importeren) dan verzonnen.

**Verplichte stap vóór `--apply`: de volledige tabel (merk · geldig-van · geldig-tot ·
naam · bron van de datum) gaat ter goedkeuring naar Timo.** De dry-run produceert die
tabel; de apply-run leest het goedgekeurde bestand in, niet de afleiding opnieuw.

## 3. Volgorde en stopcriteria

1. **Bouwen met PGlite-tests eerst** (`db/test-db.ts`, `seedBrandProduct`): de hele
   vervang-semantiek — upsert, wissen, archiveren, onzichtbaar worden, category-weigering,
   prijsdekking-poort, rollback — wordt op PGlite bewezen vóór er één Neon-query loopt.
   Let op de bekende val: PGlite slikt `db.transaction()` terwijl neon-http gooit; de
   transactielaag test dus alleen het websocket-pad, en de tests dekken ook het
   `--geen-transactie`-pad.
2. **Generale repetitie op de echte DB met een throwaway merk.** Keuze en argument
   (je vroeg erom): géén Neon-branch — die is eerder zonder aankondiging verdwenen en
   het is een repetitie die niets bewijst over productie-gedrag onder de echte data.
   Wél een wegwerpmerk naar het model van `scripts/testmerk-1-4.ts`: een merk
   `ZZZ-Bulktest` met een mini-Excel (10 rijen, zelfde template), volledige cyclus
   import → verifiëren → rollback → opruimen. Raakt nul echte catalogusdata; alle
   schrijfacties hangen aan één brandId dat daarna weg is.
3. **Dry-run over alle 50** → rapport per merk (validatie, categorieën, prijsdekking,
   artikelcode-collisies, afgeleide metadata) + de goedkeurtabel uit §2.
4. **Apply in oplopende impact**, één merk per aanroep, verificatie tussen elke stap:
   - eerst **solid-lighting** (93 rijen, bron 2016 → landt verlopen: een fout is per
     definitie onzichtbaar voor gebruikers);
   - dan de staart ≤ 5.000 rijen, dan de middenmoot, dan dark/molto-luce/orbit,
     **Intra als laatste**.
5. **Verificatie per merk** (script-subcommando, geen handwerk): rijen-in-bestand ==
   producten geüpsert == prijsregels; oude lijst `replaced_at` gezet en regels in
   `archive.prices_archive`; telling `visible_products` voor het merk klopt met
   verwachting (0 bij verlopen lijsten!); events aanwezig; steekproef van 5 producten
   in de UI.
6. **Stoppen** bij: elke validatie-afwijzing die de dry-run niet voorspelde, elke
   telling die niet klopt, elke onverwachte wijziging bij een ánder merk. Niet
   doorgaan met het volgende merk zolang het vorige niet geverifieerd is.

## 4. Als het misgaat

- **Binnen een transactie** (alle merken behalve mogelijk Intra): rollback is
  automatisch; de database is exact als ervoor.
- **`--rollback <slug>`** (gebouwd en op PGlite + throwaway-merk bewezen vóór de eerste
  echte apply): nieuwe prijslijst archiveren, oude lijst herstellen uit
  `archive.prices_archive` (de rijen dragen `originalPriceId` en de lijst-metadata) en
  `replaced_at` terugzetten, door deze import aangemaakte producten verwijderen (ids
  staan in het manifest), veld-wijzigingen terugdraaien uit de {old,new}-events.
  Dit is het terugrolpad dat je miste — zonder dit schiet ik geen 1,3M rijen in.
- **Noodluik**: Neon point-in-time restore van het hele project. Bestaat, maar zet
  álles terug (ook werk van parallelle sessies) — alleen voor totale rampen, en de
  reden dat er maar één merk tegelijk wordt geapplied.
- **Afgebroken run zonder transactie** (Intra-vluchtweg): herstartbaar door idempotente
  upserts; zolang de prijslijst-flip niet gedraaid heeft is er niets zichtbaar veranderd.

## 5. Merken die extra aandacht vragen

| merk | waarom | actie |
|---|---|---|
| zora | bestand is NEKO Lighting, niet Zora (151k vs 429 in XIS) | **niet importeren**; Timo beslist over merk-toewijzing |
| h-fele-lighting-nimbus | prijskolom bewust leeg (netto-lijst) én bron 2022/2023 | weigeren op de prijsdekking-poort; actuele lijst opvragen |
| intra-lighting | 790k rijen, 42× het gemeten faalgeval | laatste in de rij; eerst omvang-sanity (§6), vluchtweg zonder transactie |
| krea-design, prandina, philips-lichtbronnen, oligo, solid-lighting, osram, decor-walther, e.a. (17 merken bron ≤ 2023) | landen bewust als verlopen → merk wordt onzichtbaar in zoekresultaten | gewenst effect (jouw besluit), maar de verificatiestap moet 0 zichtbare producten als *goed* rekenen, en dit hoort expliciet in de goedkeurtabel |
| ~14 merken waarvan de notitie iets over lege/ontbrekende prijzen zegt (o.a. brokis, buzzi-buzzi, leds-c4, prolicht, penta, lumiparts) | mogelijk gedeeltelijke prijsdekking | triage in de dry-run: dekkingspercentage per merk in het rapport, drempel beslist |
| brink-v-merk | eigen merk, LED Retrofit 2026 | gewoon meedoen, maar handmatige steekproef — fouten hier zijn direct zichtbaar voor Brink zelf |
| de 8 zonder bronjaar | geldig-van moet uit bestand/XIS komen | opzoeken; niet gevonden = niet importeren |

## 6. Wat ik eerst nog wil uitzoeken (vóór de bouw)

1. **Huidige stand per merk in de database**: hoeveel producten en welke prijslijst
   hebben deze 50 merken nu (XIS-import)? Bepaalt per merk wat "vervangen" feitelijk
   doet en hoeveel producten onzichtbaar worden — dat hoort in de goedkeurtabel.
2. **Taal/vorm van de category-paden in de Excels** tegen `categories.fullPathNl`:
   Timo's Excels zijn gecheckt tegen `brink_categories.csv`, maar de resolver matcht
   tegen de databasetabel — één afwijking in separator of casing en alles wordt
   geweigerd. Dry-run meet dit exact.
3. **Intra-omvang**: is 790k echte artikelnummers of een variantenexplosie, en wat doet
   dat met matcher-performance en de merk-UI? Meting op de throwaway-kopie vóór besluit.
4. **Events-payload-omvang** bij de grootste update-merken (schatting uit de dry-run-diff)
   — bepaalt of de per-product-events overal aan kunnen blijven.
5. **Neon-gedrag bij de grootste transactie** (dark, 73k) — meten op het throwaway-merk
   met een opgeblazen testbestand vóór we het op een echt merk proberen.
6. **De geldig-van van de 8 merken zonder bronjaar** (bestand zelf, anders XIS).

## Buiten scope

De UI-ombouw uit `docs/goal-template-upload-direct-import.md` (blijft apart werk),
het merkportaal (4.B), en de 224 nog niet verwerkte merken — al is dit script daarna
wél de route waarmee die binnenkomen.
