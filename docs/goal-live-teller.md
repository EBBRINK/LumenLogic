# Goal: live treffer-teller op /catalog

Bouwt voort op `docs/goal-resultaatplafond.md` (de "Showing 9 of 237"-regel).
Besloten in de demosessie met Brink Licht, 12 augustus 2026.

## Wat de klant wilde

Het aantal treffers telt live mee terwijl je typt, zonder enter. Zijn eigen voorbeeld: kies
merk Delta Light, typ "Ent" → 719 treffers, "Entero 2700" → 375, nog een teken verder → 75.
Hij vergeleek het met een autovergelijkingssite (Volvo 7000 → Volvo 240 → 17 → bouwjaar → 3).
Elk stukje informatie reduceert de stapel, en dat moet je vóélen. Het was het onderdeel waar
hij het meest enthousiast over werd bij de necolighting.com-referentie: "door dit te doen past
hetgeen hieronder zich meteen aan — dat hij meebeweegt."

## Wat er gebouwd is

- `countSearchMatches()` in `lib/repo/products.ts` — een count-only pad dat langs **exact
  dezelfde WHERE-bouwers** loopt als `runSearch`. Geen rijen, geen ORDER BY, geen
  `similarity()`. Teller en lijst kunnen daardoor niet uit elkaar lopen.
- `countCatalogMatches()` in `app/catalog/actions.ts` — sessiepoort → schema-parse → repo,
  volgens `docs/INVOERVALIDATIE.md`. De vorm van het zoekformulier staat op één plek
  (`lib/catalog-zoekvorm.ts`) en wordt gedeeld met `app/catalog/page.tsx`.
- `components/catalog-search-form.tsx` — 200 ms debounce, een volgnummer tegen antwoorden die
  elkaar inhalen, en `aria-live="polite"` omdat het getal zonder focuswissel verandert.
- De teller staat naast de Search-knop en is dus óók zichtbaar als er nog niets getoond wordt.

### Twee dingen die het bewust NIET doet

**Niet loggen.** IJzeren regel 5 gaat over zoekacties, matches en offertes. Een gedebouncede
toetsaanslag is er geen. De eerste versie van dit werk logde wél, onder een eigen action
`search_count`; dat is teruggedraaid. Eén ingetypte zoekterm van drie woorden zette een dozijn
rijen in `events` en begroef daarmee juist de échte gebeurtenis — de verstuurde zoekopdracht,
mét `totalCount`. Bovendien maakt een INSERT per toetsaanslag van een "lichte telquery" een
schrijfpad op een database met >1 miljoen producten. Zelfde afweging en zelfde uitkomst als in
`app/api/health/route.ts`. Er staat een test op dat de teller niets schrijft en de zoekopdracht
zelf nog wél.

**Geen rijen teruggeven.** Alleen een getal. Wie de producten wil zien, drukt op Search — dat is
de bestaande, gelogde weg.

## De zoeksemantiek: streng, met zichtbare terugval

Tijdens het bouwen bleek de gevraagde ervaring niet uit de bestaande matcher te komen. De tokens
van de zoektekst stonden in OR ("≥1 token aanwezig") — een bewuste keuze, zodat een beschrijvend
woord dat niet in de SKU-naam staat de rang verlaagt maar de kandidaat niet uitsluit. Gevolg: een
woord erbij typen maakte de stapel nooit kleiner.

Gemeten op een gezaaide familie, vóór de wijziging:

| zoektekst | treffers |
| --- | --- |
| `ENTERO` | 13 |
| `ENTERO 2700` | 13 |
| `ENTERO 2700 VARIANT 03` | 13 |

Besluit van Timo (20 aug): **AND, met terugval naar OR.** Elk zoekwoord moet voorkomen; levert
dat nul treffers op, dan valt de zoekopdracht terug op de brede variant én zegt het scherm dat
erbij. Die terugval mag niet stil gebeuren: OCR-aanvragen zitten vol verschrijvingen, en zonder
melding typ je een woord extra, wordt de stapel gróter, en klopt er niets meer van.

Na de wijziging, dezelfde zaaiing:

| zoektekst | treffers |
| --- | --- |
| `ENTERO` | 13 |
| `ENTERO VARIANT` | 12 |
| `ENTERO VARIANT 03` | 1 |

De wijziging zit in de gedeelde WHERE-bouwer, dus teller en lijst houden automatisch dezelfde
semantiek.

## Prestatie — gemeten op de echte database

EXPLAIN (ANALYZE) op productie, alleen lezen, merk Delta Light:

| scenario | treffers | queries | wall-clock | zwaarste plan |
| --- | --- | --- | --- | --- |
| merk alleen | 18.659 | 1 | 412 ms | 240 ms |
| `Ent` | 1.444 | 2 | 239 ms | 38 ms |
| `Entero` | 1.408 | 2 | 246 ms | 34 ms |
| `Entero 2700` | 2.520 (verbreed) | 3 | 374 ms | 72 ms |

- **Geen full scan op `products`.** De naam- en merkfilters lopen over
  `products_name_trgm_idx` en `products_brand_key_trgm_idx`; de exacte tak over
  `products_article_code_lower_idx` en `products_supplier_article_code_lower_idx`.
- Bij een brede zoekopdracht kiest de planner een hash join met een **parallel seq scan over
  `prices`** (~240k rijen). Dat is de view `visible_products`, geen ontbrekende index, en het
  blijft onder 240 ms.
- Het wall-clock-verschil met de plantijd is Neon-HTTP-round-trip. Een telling kost 1–3 round
  trips: exacte tak, strenge tak, en alleen bij nul strenge treffers de brede. Met 200 ms
  debounce voelt dat als licht na-ijlen, niet als traag.

## Specwaarden uit de vrije tekst (20 aug, vervolg)

De meting hieronder ("Wat er niet gehaald is") liet zien dat het klantvoorbeeld strandde op de
vorm van de data: `2700` is bij Delta Light geen naamwoord maar een veldwaarde. Besluit: tokens
die ondubbelzinnig een specwaarde zijn, worden uit de zoektekst gevist en als **specfilter**
toegepast in plaats van als naamwoord.

- `lib/spec-tokens.ts` — pure herkenner. `2700K` en kaal `2700` (alleen binnen 1800–6500 K),
  `IP44`/`IP 44`, `CRI90`/`CRI 90`/`Ra90`. Herkende tokens verdwijnen uit de tekstmatch.
- Het samenvoegen gebeurt in `bereidZoekopdrachtVoor()` in `lib/repo/products.ts` — één functie
  die teller én lijst aanroepen, zelfde reden als bij de WHERE-bouwers.
- Herkende waarden gaan het bestaande `SpecFilters`-pad in en erven daarmee "ontbrekende data
  is geen afkeuring": een armatuur zonder `kelvin` valt niet af.

Drie regels die het raden beteugelen:

1. **Een expliciet ingevuld specveld wint altijd.** Het token verdwijnt dan wél uit de tekst
   (het was geen naamwoord), maar de waarde wordt niet overgenomen — en het scherm zegt dat.
2. **Het scherm toont wat er gelezen is** ("2700 read as colour temperature"), in de live teller
   én boven de resultaten. Raden dat je niet ziet, kun je niet corrigeren.
3. **Zonder anker wordt er niet gesplitst.** Wie alleen `2700` typt, houdt een tekstzoekopdracht
   over. Anders bleef er een specfilter zonder merk of tekst over, en dat levert per bestaande
   regel nul treffers op — terwijl er producten mét 2700 in de naam bestaan.

### Gemeten op de echte database, merk Delta Light

| zoektekst | vóór | ná | herkend |
| --- | --- | --- | --- |
| `Ent` | 1.444 | 1.444 | — |
| `Entero` | 1.408 | 1.408 | — |
| `Entero 2700` | **2.520 (verbreed)** | **1.026** | 2700 → kelvin |
| `Entero 2700K` | 2.520 (verbreed) | 1.026 | 2700K → kelvin |
| `Entero 2700 IP44` | — | 522 | 2700 → kelvin, IP44 → ip |
| `Entero 2700 CRI90 IP44` | — | 522 | + CRI90 → cri |

Het klantvoorbeeld versmalt dus nu écht: 1.444 → 1.408 → 1.026 → 522, in plaats van omhoog te
springen naar 2.520 met een terugvalmelding.

Bijvangst in de prestatie: de zware tak werd lichter. `Entero 2700` deed eerst 72 ms met een
parallel seq scan over `prices`; nu 6 ms via `prices_product_idx`. De tekstmatch is korter
geworden (één token in plaats van twee), en het kelvin-filter snijdt vroeg.

## Wat er NIET gehaald is

**Het letterlijke klantvoorbeeld werkt niet, en dat ligt aan de data — niet aan de teller.**
Gemeten op productie: `Entero 2700` levert nul strenge treffers op en verbreedt naar 2.520. De
reden staat in de productnamen van Delta Light:

```
MOUNTING KIT ENTERO RD-S O.F.A.   | kelvin: null
MOUNTING KIT ENTERO RD-M CSC      | kelvin: null
```

De kleurtemperatuur zit niet in de naam maar in het veld `kelvin`. "2700" als vrije tekst zoekt
dus naar iets wat er niet staat. Versmallen doe je hier met het veld **Color temp. (K)**, en dat
werkt wél:

| ingevuld | treffers |
| --- | --- |
| `Entero` | 1.408 |
| `Entero` + 2700 K | 1.026 |
| `Entero` + 2700 K + CRI 90 | 1.026 |
| `Entero` + 2700 K + CRI 90 + IP44 | 522 |

Dat het niet harder daalt komt door een andere bestaande regel: ontbrekende data is geen
afkeuring, dus een product met `kelvin = null` blijft meetellen. Bij deze merken is dat de
meerderheid.

**Dit is opgelost** met de spec-token-herkenning hierboven (optie 1 van de twee die hier eerst
stonden). De tabellen in deze sectie beschrijven de toestand vóór die wijziging; ze blijven
staan omdat ze de aanleiding en de meetlat zijn.

Wat blijft: het versmalt minder hard dan de "719 → 375 → 75" uit de demo. Dat komt door
"ontbrekende data is geen afkeuring" — bij deze merken heeft de meerderheid van de armaturen
geen `kelvin`-waarde, en die blijven meetellen. Dat is een bestaande, bewuste regel; hem hier
omdraaien zou producten stil laten verdwijnen.

**Buiten scope gebleven** (stond zo in de opdracht): meebewegende facetten die onmogelijke
opties verbergen, en de slimme vervolgvraag boven een bepaald aantal treffers. Beide leunen op
facettellingen per veld.
