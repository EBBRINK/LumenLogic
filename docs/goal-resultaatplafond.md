# Goal: resultaatplafond in de catalogus-zoekfunctie

Besloten in de demosessie met Brink Licht op **12 augustus 2026**. Gebouwd 19 augustus 2026.

## Het probleem

Een zoekopdracht met weinig informatie leverde een enorme lijst treffers die allemaal
technisch klopten en samen waardeloos waren. Uit de sessie: één Delta Light-product met
alleen een Kelvinwaarde als criterium gaf acht "mogelijke matches" — en er hadden er
honderden kunnen staan, want er was maar één datapunt bekend. De bouwer noemde het zelf
"eigenlijk bullshit". De klant: *"ik heb geen interesse om de hele catalogus te tonen."*

De achtergrond van de klant weegt hier zwaar: Brink geeft al twintig jaar precieze
antwoorden op vage vragen en krijgt de schuld als het misgaat (kroonluchters zwart geleverd
omdat er nergens "goud" stond). De tool moet dat patroon doorbreken — niet voortzetten door
alles te tonen wat technisch past.

## Wat er is gebouwd

1. **Maximaal 9 resultaten.** De klant noemde eerst 25 en corrigeerde zichzelf: *"misschien
   is 9 wel voldoende."* Constante `RESULTAAT_PLAFOND` in `app/catalog/page.tsx`.
2. **Het werkelijke totaal staat erbij** — "Showing 9 of 237 matches". Dat getal is de
   prikkel om meer in te vullen: je moet zien hoe groot de stapel is die je niet ziet.
3. **Geen doorbladeren.** Expliciet zo besloten: *"mensen moeten hun informatie
   aanleveren."* Er is geen volgende-pagina, geen "toon alles", geen scroll naar de rest.
   Een test in `components/catalog.test.tsx` valt om zodra iemand zo'n knop toevoegt.
4. **Geen stille afkapping.** Wat wordt weggelaten staat op het scherm, niet alleen in de
   code: "the other 228 are left out and cannot be paged through."

## De ene technische beslissing die telt

Het getoonde totaal moet het aantal **zichtbare** treffers zijn (ijzeren regel 3: een
verlopen prijslijst maakt een product onzichtbaar in álle zoekresultaten), en het moet exact
de rijen tellen die dezelfde zoekopdracht ook zou teruggeven.

Daarom zijn de specfilters (Kelvin / CRI / IP) verhuisd van JS naar SQL:
`searchProductsWithTotal()` in `lib/repo/products.ts` doet één `count(*)` over precies
dezelfde WHERE als de resultaatquery, beide op de view `visible_products`. Zou een filter
pas ná de query in JS toeslaan, dan telt de teller rijen die de gebruiker nooit te zien
krijgt — dan liegt "9 of 237".

De regel "ontbrekende data is geen afkeuring" is meeverhuisd: een product wordt alleen
uitgesloten als het **aantoonbaar** niet voldoet (data aanwezig én te laag/anders). `null`
glipt er in SQL bewust doorheen en belandt via `classify()` in "Possible — data incomplete".

`searchProducts()` blijft bestaan en gedraagt zich ongewijzigd; het review-scherm gebruikt
die nog. Het event-log krijgt bij een getelde zoekopdracht `totalCount` naast `resultCount`,
zodat terug te zien is hoeveel er achter het plafond bleef liggen.

## Meetlat

- `lib/repo/products-plafond.test.ts` — plafond houdt, totaal telt door, verlopen prijslijst
  telt niet mee, specfilter filtert en telt in dezelfde adem, IP-ondergrens leest hetzelfde
  getal als het scherm.
- `components/catalog.test.tsx` — teller met weglating, teller zonder weglating, en de
  afwezigheid van elke doorblader-knop. Screenshots licht/donker × mobiel/desktop.

## Bewust NIET gebouwd (apart belegd)

- De slimme vervolgvraag: boven de 25 treffers vragen om het kenmerk dat het sterkst
  reduceert (bijvoorbeeld dimbaarheid).
- Live meetellen tijdens typen, zonder enter.
- Facetten die meebewegen en onmogelijke opties verbergen.

Dit document beschrijft alleen het plafond plus de teller — de kleine helft die nu al waarde
oplevert.
