# Probleem: een vervallen product bestaat niet meer

> Fase 1 van de werkwijze (probleem uitschrijven), 19 aug 2026. Aanleiding: de demosessie met
> Brink Licht van 12 aug 2026; op 19 aug door Timo bevestigd. Alle code-verwijzingen hieronder
> zijn read-only nagelopen in deze worktree. Vervolg: `docs/goal-vervallen-producten.md`.

## Het probleem in één regel

Ijzeren regel 3 maakt van "wij kennen de prijs niet meer" hetzelfde als "dit product bestaat
niet" — en juist de producten waar de klant naar zoekt zijn de producten die van de lijst
zijn gevallen.

## Wat de klant zei (12 aug)

Bestekschrijvers — hij noemde Deerns — zijn lui en hergebruiken een bestek van vorig jaar met
kleine aanpassingen: voor een zwembad pakken ze een ander zwembadproject erbij. Daar zitten
regelmatig producten in die niet meer leverbaar zijn.

> "die moeten wel gevonden worden, maar gemarkeerd worden, dat die rood zijn, dat daar iets
> mee is."

En over de prijs:

> "zullen we de prijs misschien niet eens tonen — gewoon dat het oud is, laatste prijslijst
> was die en die."

Tweede punt uit dezelfde sessie: Brink heeft een project verkocht en daarbij de plastic kits
vergeten. Bij navraag bij het merk komt zoiets alsnog boven:

> "als wij het bij een merk aanvragen, heb je kans dat ze zeggen: je hebt dit ook nodig en je
> hebt deze driver erbij nodig."

## Wat er nu gebeurt

De regel luidt vandaag: *"Verlopen prijslijst = product onzichtbaar in álle zoekresultaten
(centraal afgedwongen)."* De centrale afdwinging is de view `visible_products`
(`db/migrations/0004_vijfstatussen.sql:199-240`):

```sql
FROM products p
JOIN prices pr ON pr.product_id = p.id
JOIN price_lists pl ON pl.id = pr.price_list_id
WHERE pl.valid_from <= CURRENT_DATE
  AND pl.valid_until >= CURRENT_DATE;
```

Twee JOINs en twee datumpredicaten. Alles wat zoekt of matcht leest uitsluitend uit die view:
`lib/matching/engine.ts:188-231`, `lib/repo/products.ts:55-66`, `lib/repo/equivalence.ts:55-68`,
`lib/repo/staffel.ts:73-77`, `lib/repo/disclosure.ts:161-166`, `lib/repo/dossiers.ts:140-158`,
`lib/repo/ai-suggestions.ts:31-33`, `lib/repo/variants.ts:48-68`, `lib/repo/ocr.ts:318-325`,
`lib/ai/vangnet.ts:301-387`. Eén duplicaat van hetzelfde predicaat leeft buiten de view, in
`lib/repo/catalog.ts:38-56` (de merken-keuzelijst, bewust als semi-join herschreven met de
eis dat de uitkomst identiek blijft — `lib/repo/catalog.test.ts:63`).

Het effect is totaal. Bewezen in `lib/repo/rules.test.ts:14-53`: een verlopen product komt in
géén zoekresultaat voor, ook niet bij een zoekopdracht op zijn eigen exacte artikelnummer.
Precies dat laatste is het scenario van de bestekschrijver: hij typt het artikelnummer over
uit het bestek van vorig jaar en krijgt nul treffers — niet "dit product is vervallen", maar
niets. Onvindbaar en onverklaard zijn in dit systeem hetzelfde antwoord.

## Twee toestanden die nu op één hoop liggen

Wat "vervallen" heet is in de data twee verschillende dingen, met twee verschillende oorzaken
en twee verschillende gesprekken met het merk erachter:

**(1) De prijslijst is verlopen.** `price_lists.valid_until < CURRENT_DATE`. Dit zegt iets over
**onze data**: het merk heeft niet verlengd of wij hebben de nieuwe lijst niet verwerkt. Het
product is waarschijnlijk gewoon leverbaar. Vandaag verdwijnt het hele merk in één klap uit de
catalogus — dat is ook de reden dat `listCatalogBrands` maar ~30 van de 438 merken teruggeeft
(`lib/repo/catalog.ts:12-18`).

**(2) Het product is uit de nieuwe lijst gevallen.** De lijst is actueel, maar dit artikelnummer
staat er niet meer in. Dit zegt iets over **het product**: uit productie. Dit is de toestand
waar de bestekschrijver op stuit.

Voor de gebruiker lijken ze op elkaar (rood, geen prijs), maar het antwoord op "en nu?" is
tegengesteld: bij (1) bel je het merk om een verlenging, bij (2) zoek je een vervanger. Ze
verdienen dus twee meldingen, niet één.

## Waarom (2) vandaag onzichtbaar is in de data

Er is precies één productiepad dat producten uit een lijst laat vallen:
`lib/repo/template-import.ts:494-508` roept `replacePriceList`
(`lib/repo/price-archive.ts:71-100`) aan. Die verhuist álle prijsregels van de oude lijst naar
`archive.prices_archive`, `DELETE`t ze uit `prices` en zet de nieuwe regels erin. Een product
dat niet in de nieuwe lijst zat houdt daarna **nul** rijen in `prices` over. Het valt niet uit
de view omdat zijn lijst verlopen is, maar omdat er geen prijsrij meer is om op te joinen.

Dat betekent ook: **de historie die de klant wil tonen bestaat alleen in
`archive.prices_archive`.** Die tabel heeft `price_list_name`, `valid_from`, `valid_until` en
`archived_at` per rij (`db/schema.ts:429-448`) — genoeg voor "laatste prijslijst was die en die",
en het is de enige plek waar dat staat.

De aanname uit het geheugen dat price-archive nergens wordt aangeroepen is **verouderd**. De
huidige stand, geverifieerd:

| Pad | Nieuwe `price_lists`-rij | Verwijdert oude `prices` | Archiveert |
|---|---|---|---|
| `scripts/import.ts` (`bun run import`) | ja, per merk | nee (`onConflictDoNothing`) | **nee** |
| `lib/repo/template-import.ts` (directe import) | ja, via `replacePriceList` | ja | **ja, volledig** |
| `lib/repo/template-return.ts` (retour-pad) | alleen als er geen actieve is | nee, nooit | **ja, per gewijzigde regel** (`upsertPriceLines`) |
| `app/data/price-lists/actions.ts` | nee | nee | n.v.t. (`extendPriceListValidity`) |
| `app/brand/actions.ts` | nee | nee | n.v.t. (alleen staging) |

Het gat zit dus niet in de archieffunctie maar in `scripts/import.ts`: dat pad kent het archief
niet en gebruikt bovendien een hardgecodeerde `valid_until = 2026-12-31`
(`scripts/import.ts:26-27`). Voor de 211k XIS-producten die er zo in zijn gekomen bestaat geen
archiefrij, en zal toestand (2) dus ook niet gedetecteerd worden — die producten blijven
gewoon op hun oude lijst staan en vallen in toestand (1) zodra die lijst verloopt.

## Wat er meebeweegt als de regel verandert

De regel is de zichtbaarheidspoort van het hele systeem. Wie hem opendraait moet weten wat er
achter langs meekomt:

- **`price_list_id` mag niet zomaar meelekken.** `lib/repo/staffel.ts:86` bindt
  `price_tiers.price_list_id` aan `visible_products.price_list_id` — blijft die gevuld voor een
  verlopen lijst, dan verschijnt er een staffelprijs uit een verlopen lijst. Dat is exact wat de
  nieuwe regel verbiedt.
- **Alternatieven-suggesties.** `lib/repo/equivalence.ts:174-176` haalt alternatieven uit de
  view. Een alternatief voorstellen dat je niet kunt prijzen is geen alternatief.
- **Het AI-vangnet** (`lib/ai/vangnet.ts:301-387`) zoekt in dezelfde view en gaat dus vervallen
  producten voorstellen.
- **`lib/repo/ai-suggestions.ts:31-33` joint `INNER`**: een suggestie op een onzichtbaar product
  verdween tot nu toe stilzwijgend. Vanaf nu komt hij terug.
- **De teller op `/catalog`.** `components/catalog-search.tsx:137` telt
  `aantoonbaar.length + onvolledig.length`, met `limit: 40` in `app/catalog/page.tsx:124`. De
  resultaatverzameling wordt groter, dus alles wat op die telling leunt verandert mee.
- **Het uitschakelmechanisme van het testmerk.** `ZZTEST QA-14` staat bewust in productie en is
  uitgezet *dóór de prijslijst te laten verlopen* (`HANDOVER.md:1133-1135`): "Uitschakeling is
  gebeurd via ijzeren regel 3, niet met DELETE." Met de nieuwe regel komen die producten terug
  in de zoekresultaten. Dat is geen bijvangst maar een direct gevolg: rule 3 was ook de aan/uit-
  knop, en die knop verdwijnt.
- **`getVisibleProduct` is al voorbereid.** `app/projects/[id]/line/[lineId]/page.tsx:63-84`
  toont een kandidaat waarvan het product uit de view viel al als "(product no longer visible)",
  en `lib/repo/day-price.ts:104-136` heeft al de tak "geen catalogusprijs om op terug te vallen".
  Het gedrag dat we willen bestaat dus in fragmenten; wat ontbreekt is de bron die het uitlegt.

## Het tweede probleem: de driver die niemand meerekent

In een prijslijst staat een driver, een honingraatfilter of een andere accessoire als **losse
regel**, zonder enige relatie tot het armatuur waar hij bij hoort. Die relatie bestaat nergens
in onze data, en ook niet in de bron:

- `products` heeft **geen** kolom die zegt "dit is een accessoire" (`db/schema.ts:264-378`).
  `driver_included` en `driver_type` zijn eigenschappen van een armatuur, geen producttype.
- `category_path` is gevuld op **19 van de 211k rijen** (`HANDOVER.md:1431`) en gebruikt drie
  verschillende scheidingstekens door elkaar.
- Het enige werkende signaal is een naam-regex, `ONDERDEEL_START` in
  `lib/enrichment/verdenking.ts:126-127`. Verankerd aan het begin van de naam, en daarom
  precies waar de niet-verankerde `ACCESSOIRE`-regex (`:101`) 3.700 gewone armaturen vlagt die
  netjes melden dat hun driver is meegeleverd. Gemeten treffers: **453 producten die werkelijk
  een los onderdeel zijn**, geconcentreerd op Wever & Ducré (197), Flos Architectural (110),
  Lombardo (82), TossB (38) en Marset (21).
- De uitkomst van die regex wordt vandaag nergens vastgelegd: hij onderdrukt alleen
  verrijkingsvoorstellen (`lib/repo/enrichment.ts:112-125`) en bereikt de matcher nooit.

Een echte koppeling armatuur → driver vraagt dus zowel een datamodelwijziging als een bron voor
die relatie die wij niet hebben. Een driver is bovendien niet op wattage te kiezen — er zijn
verschillende types — dus automatisch kiezen is sowieso geen optie. Wat wél kan: het merk-brede
feit dat dit merk losse onderdelen voert, en dat is precies genoeg om iemand te laten navragen.

`docs/zwerm-kolomonderzoek-28-merken.json:309` heeft hier het scherpste bewijs voor: bij Serien
Lighting zijn 89 van de 1955 producten accessoires (fronten, lenzen, reflectoren, baldakijns),
alleen herkenbaar aan hun Duitse naam, en `LD1301 "LYD Wall Front IP44"` (€ 159,66) komt als
geldig armatuur door de IP-poort.

## Wat dit document niet beslist

De richting staat vast (regel 3 wordt "zichtbaar zonder prijs, rood, met de laatst bekende
prijslijst erbij"; de driver-koppeling wordt een waarschuwing, geen relatie). Wat er precies in
de view komt, waar de twee meldingen landen en hoe terughoudend de driver-waarschuwing wordt,
staat in `docs/goal-vervallen-producten.md`.
