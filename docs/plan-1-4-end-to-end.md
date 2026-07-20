# Plan 1.4 — synthese van twee onafhankelijke plan-agents (fase 2)

> Twee opus-agents planden onafhankelijk; ik heb hun harde claims zelf tegen de code en de
> productie-DB geverifieerd voordat ik ze overnam. Alle cijfers hieronder zijn door mij
> nagemeten, niet overgenomen op gezag.

## De kern die beide agents onafhankelijk vonden

**Het acceptatiecriterium is zoals het er staat bijna niet te falsifiëren.** "De 0007-kolommen
tellen aantoonbaar mee" is waar zodra één 0007-veld op 100% staat — en dat cijfer krijg je ook
als de scorecard ze helemaal niet zou meten.

`bucketScore` (lib/field-catalog.ts:270-297) deelt door het **aantal producten van het merk
zelf**. Een leeg testmerk volledig vullen geeft dus overal ratio 1,0 — en dat had 1.3-A niet
nodig gehad: vóór 1.3-A waren het 25 velden op 1,0, nu 70 velden op 1,0. **Hetzelfde
percentage.** Een screenshot van "0% → 90%" scheidt het criterium niet van "er zijn rijen
bijgekomen".

De remedie waar beide agents onafhankelijk op uitkwamen: **een fixture met een opzettelijk
ONGELIJK vulpatroon, met de verwachte cijfers vooraf vastgelegd.** Een gradiënt van
3/3 → 2/3 → 1/3 → 0/3 kan alleen ontstaan als elke kolom afzonderlijk gelezen wordt. Dat
patroon kun je niet per ongeluk krijgen, en een meting die niet kan falen bewijst niets.

## De nulmeting die dit item onweerlegbaar maakt (zelf gemeten, 20 jul 14:20 UTC)

```
producten | sdcm | ugr | ean | url_ds | url_sp | dimprot | efficacy | ik | name_en
   211311 |    0 |   0 |   0 |      0 |      0 |       0 |        0 |  0 |       1
```

**Over 211.311 producten staat er DB-breed geen enkele waarde in ook maar één 0007-kolom.**
De enige `name_en` is het Flos-testproduct van 20 jul. Elke niet-nul die straks in die kolommen
staat is dus per constructie door deze keten gezet. Dat is sterker bewijs dan een merk-lokale
vóór/ná ooit kan zijn, en het lost meteen het randgeval op dat een "vóór"-scorecard op een leeg
merk inhoudsloos is (`hasProducts=false`).

Events-nulmeting, en dit is de scherpste vondst van het item:

| actie | count in productie |
|---|---|
| `template_upload_staged` | 1 |
| `template_apply_started` | 1 |
| `product_created_from_template` | 1 |
| `template_apply_finished` | 1 |
| **`price_list_created`** | **0** |
| **`price_lines_upserted`** | **0** |
| **`brand_template_downloaded`** | **0** |

Het prijzenpad van het retourpad heeft in productie **nog nooit gedraaid**. Dat is precies het
gat dat dit item moet dichten, nu met een cijfer erbij.

⚠️ Gevolg voor de meting: er staat **al één complete keten in `events`**. Tel je zonder
tijdsondergrens, dan tel je die mee en klopt je "spoor is compleet" toevallig. Daarom `t0`
vastleggen vóór de keten: **`2026-07-20 14:20:05.693761+00`**.

## Vondsten in de briefing (melden, niet blind volgen)

**V1 — De eventlijst is incompleet, en mist precies de events met bewijskracht.**
Briefing regel 116-117 noemt 4 acties. De werkelijke keten telt er 9:

| # | actie | bestand:regel |
|---|---|---|
| 1 | `brand_template_downloaded` | app/data/brand-relations/template/route.ts:17 |
| 2 | `template_upload_staged` | lib/repo/template-return.ts:97 |
| 3 | `brand_relation_status_changed` (→ data_ontvangen) | lib/repo/brand-relations.ts:269 |
| 4 | `template_apply_started` | lib/repo/template-return.ts:334 |
| 5 | `product_created_from_template` ×n | lib/repo/template-return.ts:451 |
| 6 | **`price_list_created`** | lib/repo/price-archive.ts:145 |
| 7 | **`price_lines_upserted`** | lib/repo/price-archive.ts:221 |
| 8 | `brand_relation_status_changed` (→ verwerkt) | lib/repo/brand-relations.ts:269 |
| 9 | `template_apply_finished` | lib/repo/template-return.ts:576 |

De vier genoemde bestaan en staan in die volgorde — dat deel klopt. Maar 6 en 7 zijn het
**enige spoor dat er een prijs geschreven is**, en juist die staan op 0. Wie de briefing braaf
volgt, verifieert een "compleet audit-spoor" waarin de helft ontbreekt die dit item moet
bewijzen.

**V2 — Er bestaat geen pad om een prijslijst te laten verlopen.**
De briefing (regel 63-65, 100, 118) beschrijft de uitschakelaar alsof hij er is. Het enige wat
erop lijkt is `archivePriceList` (lib/repo/price-archive.ts:14-65) en dat doet iets anders én
verbodens: het zet `replaced_at` (niet `valid_until`) en doet `db.delete(prices)` op regel 46 —
een echte DELETE van live rijen. Dat omzeilt regel 3 in plaats van hem te demonstreren, en
vernietigt het bewijs dat het verlopen (en niets anders) het product onzichtbaar maakte.

Het verlopen moet dus een `UPDATE` zijn. Om ijzeren regel 5 te halen hoort daar een event bij.
**Dat is één stukje code meer dan de briefing toestaat ("bouw je meer dan een aanmaakscript:
stop en meld het") — bij dezen gemeld.** Ik los het op met één scriptbestand met twee
commando's (`create` / `expire`), niet met twee scripts.

**V3 — De voorgestelde merknaam `ZZ-TEST Lumen Logic` is een slechte keuze.**
Briefing regel 60. Zelf geverifieerd op lib/matching/engine.ts:294: de merkvergelijking is
`brandName LIKE '%' || genormaliseerde_query || '%'` — een **substring**, geen gelijkheid. Een
spec-regel met merktekst "Lumen" matcht deze merknaam. Ik gebruik **`ZZTEST QA-14`**
(genormaliseerd `zztestqa14`), dat geen enkel verlichtings- of merkwoord bevat.

**V4 — De briefing noemt één blootstellingsoppervlak, er zijn er meer.**
Stap 3a (engine.ts:266-278) is correct beschreven. Maar engine.ts:288 laat 3b **merkloos** over
álle zichtbare producten zoeken zodra een regel wel producttekst maar géén merktekst heeft. Ook
`searchProducts` (lib/repo/products.ts:89-99) en de merk-dropdown van /catalog
(app/catalog/page.tsx:101-107) zijn oppervlakken. Mitigatie: naast de artikelcode ook de
**productnaam** codeachtig houden (geen "spot", "downlight", "LED") en **absurde matcher-specs**
(kelvin 9999, cri 1, IP00, lumen 1) — de scorecard meet `IS NOT NULL` en leest de waarde nooit
(brand-relations.ts:164), dus je krijgt volle dekking terwijl elk parametrisch filter het
product uitsluit.

**V5 — "verdwijnen uit álle zoekresultaten" (regel 65) is te sterk.**
`visible_specs` (db/migrations/0005_h2_h3.sql:120-146) heeft geen prijs-join en filtert alleen
op `status = 'actief'`. De productpagina van het testartikel blijft ná het verlopen dus bestaan,
mét specs, zonder prijs. Te rapporteren als restrisico, niet als fout.

## Vondsten in mijn eigen probleemdoc

- **Correct:** `brands.id` zonder `defaultRandom()`; `list_price_excl_vat` is must; de twee
  geldigheidsdefinities lopen uiteen.
- **Fout:** ik citeerde db/schema.ts:687 voor de view-DDL. Dat is een comment boven een
  `.existing()`-stub die nog naar migratie 0001 verwijst; de operatieve DDL staat in
  **db/migrations/0004_vijfstatussen.sql:201-241** (zelf geverifieerd). Het is bovendien
  `CURRENT_DATE`, niet `now()` — een **date**. Die verouderde comment is zelf een kleine
  codevondst.
- **Fout:** mijn "0 → n op een leeg merk bewijst het" (regel 40) is precies de meting die
  niets bewijst. Zie de kern hierboven.
- **Getoetst en beantwoord:** de merkpagina werkt zonder `brand_relations`-rij
  (app/data/brand-relations/[brandId]/page.tsx:47-50, coalesce op :111). Sterker: het script
  moet die rij **niet** aanmaken, want `stageTemplateReturn` doet het zelf mét event
  (template-return.ts:107).

## Codevondsten (melden met bewijs, NIET fixen — het item verifieert deze bestanden)

- **C1 — `template_apply_finished.appliedFields` is structureel 0 bij een run met alleen
  nieuwe producten.** `appliedFields` wordt uitsluitend opgehoogd in de bestaande-producten-lus
  (lib/repo/template-return.ts:518); de nieuwe-producten-lus (:415-478) hoogt hem nooit op. Het
  eindevent van precies het scenario dat 1.4 voorschrijft rapporteert dus "0 velden toegepast".
  De betrouwbare veldteller is `product_created_from_template.payload.fields`.
- **C2 — Een niet-opslagbaar veld op een nieuw product laat geen enkel event achter.**
  template-return.ts:419 slaat alles ≠ `kind:"new"` over; template-diff.ts:525-548 maakt er een
  conflict van dat wel op het scherm staat maar nergens gelogd wordt.
- **C3 — Nergens wordt gevalideerd dat `validFrom <= vandaag`.** Niet in het formulier
  (components/data/template-proposal.tsx:630, alleen `required`), niet in de action
  (upload-actions.ts:186-190), niet in `upsertPriceLines`. Gevolg: een `validFrom` van morgen
  geeft **scorecard "prijs ✓" terwijl de catalogus leeg blijft**. Dat is niet alleen een
  meetvalstrik maar een reëel gat in het product.
- **C4 — `brand_template_downloaded` heeft `entity_id: null`** bij `entity: "brand"`
  (template/route.ts:17); de route kent geen brandId. De download is dus principieel alleen op
  tijdstip aan het merk te koppelen — te melden als beperking, niet te verdoezelen.

## De fixture — pre-registratie (vastgelegd vóór de upload)

3 producten, opzettelijk ongelijk gevuld. Artikelcodes `ZZTEST-LL14-0001..0003` (getoetst
tegen productie, ook genormaliseerd: 0 treffers).

| veld | gevuld op | verwacht |
|---|---|---|
| `supplier_article_code`, `name_en`, `category` (must) | 3/3 | 100% |
| `sdcm`, `ean_code`, `url_datasheet`, `dim_protocol` | 3/3 | 100% |
| `ugr`, `efficacy`, `url_supplier_page` | 2/3 | 67% |
| `ik_rating`, `url_install_manual` | 1/3 | 33% |
| `url_photometry`, `url_declaration` | 0/3 | 0% |
| **prijs** | **2/3** | **67%** ← negatieve controle |

**De prijs op 2/3 is de belangrijkste keuze in dit plan.** Hij geeft een *binnen-merk*
differentiaal in `visible_products`: twee producten zichtbaar, één niet, op hetzelfde moment
onder dezelfde prijslijst. Dat scheidt "de view toont alle producten van het merk" van "de view
toont producten met een geldige prijs" — iets wat 3/3 principieel niet kan.

Structureel plafond om vooraf vast te leggen: van de 70 meetbare velden zijn er 4
(`stock`, `stock_reserved`, `show_on_web`, `show_price_on_web`, field-catalog.ts:96-99)
`internalOnly` en door `excelColumns()` uitgefilterd (:230-238). **Max haalbaar via deze route:
66/70.** Anders leest de "ná" als onderprestatie terwijl het een ontwerpplafond is.

## Valstrikken die de meting stil laten slagen of mislukken

1. **`valid_from` in de toekomst** → scorecard ✓, catalogus leeg, beide ogen gezond. (C3)
   → `valid_from` = vandaag.
2. **`valid_until = current_date` bij het verlopen** → `>=` is inclusief, product blijft
   zichtbaar. → `current_date - 7`.
3. **Events tellen zonder `t0`** → de Flos-keten van 11:30 telt mee.
4. **De "ná"-scorecard ná het verlopen meten** → `list_price_excl_vat` valt naar 0.
   → meet vóór het verlopen.
5. **Eenheid in een getalcel** (`110 lm/W`, `>80`) → `getal()` (template-diff.ts:196-201)
   accepteert alleen een kaal decimaal getal → `unprocessable`, veld stil niet toegepast (C2).
6. **`archivePriceList` gebruiken om op te ruimen** → DELETE, bewijs vernietigd. (V2)
7. **Fixture genereren uit `excelColumns()`** → dan toets je field-catalog.ts tegen zichzelf.
   → het écht gedownloade template vullen, kolommen op **labeltekst in rij 2** matchen
   (excel-validate.ts:28-30), nooit op hardgecodeerde index.

## Alternatieve verklaringen die het verlopen moet uitsluiten

Bij de vóór/ná-meting moeten deze invarianten **onveranderd** zijn, anders bewijs je niet
regel 3 maar "ik heb een rij aangepast":

| invariant | verwacht |
|---|---|
| `products` van het merk | 3 → 3 |
| `prices`-rijen (zelfde id's, zelfde bedrag) | 2 → 2 |
| `price_lists`, waarvan actief | 1/1 → 1/1 |
| `valid_from` | ongewijzigd |
| `replaced_at` | NULL → NULL |
| `archive.prices_archive` voor dit merk | 0 → 0 |
| `visible_products` van **andere** merken (controlegroep) | ongewijzigd |
| **`visible_products` van dit merk** | **2 → 0** |

Alleen de laatste regel mag bewegen.

## Volgorde van uitvoeren (fase 3, geen agents)

0. `git fetch origin` ✔ · `t0` vastgelegd ✔ · nulmetingen gedaan ✔
1. `scripts/testmerk-1-4.ts create` → merk `ZZTEST QA-14`, id noteren
2. Scorecard "vóór" op het merk (0 producten → `hasProducts=false`)
3. Template downloaden **via de UI** (logt `brand_template_downloaded`)
4. Fixture vullen op basis van het gedownloade bestand (wegwerpscript in scratchpad, niet in git)
5. Uploaden op de merkpagina → voorstel
6. **Poort:** voorstel controleren — 3× nieuw, 0 blokkades, prijslijst-fieldset zichtbaar.
   Klopt het niet: stoppen.
7. Goedkeuren — `valid_from` = **vandaag**, `valid_until` = 2026-07-26
8. **Meting 1** scorecard ná · **Meting 2** catalogus (query + live UI) · **Meting 3** events
9. Invariant-snapshot vóór het verlopen
10. `scripts/testmerk-1-4.ts expire` → `valid_until = current_date - 7` + event
11. **Meting 4** ná: invarianten + zichtbaarheid 2→0 + UI-hercontrole
12. `bun vitest run`, `bunx tsc --noEmit`, HANDOVER, commit met expliciete paden
