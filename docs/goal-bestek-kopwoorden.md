# Goal: bestek-kopwoorden — koprij-herkenning die een echt bestek aankan

**Datum:** 20 aug 2026 · **Status:** spec, wacht op goedkeuring testnaden
**Probleem:** `docs/probleem-bestek-kopwoorden.md` (gemeten: het Bos-bestand levert 9
onzinregels in plaats van 41 armaturen). De besluiten van 20 aug staan daar vast en worden
hier niet heropend; deze spec beslecht alleen de twee open keuzes (tiebreak en drempel).

---

## Testnaden — GOEDGEKEURD (Timo, 20 aug 2026)

> Alle drie de open punten zijn beantwoord, telkens conform de aanbeveling van de planner.
> De spec is daarmee definitief; er verschuift niets meer aan de naden hieronder.
>
> - **Keuze (a), tiebreak:** exact vóór deelwoord, in twee passes. Akkoord.
> - **Keuze (b), drempel:** de ≥2-drempel blijft, met de verscherping dat minstens één
>   treffer exact moet zijn. Akkoord.
> - **Screenshot-eis:** vervalt voor deze klus. Dit is parser-werk in `lib/table` en er
>   verandert geen enkele component, dus een screenshot van ongewijzigde UI bewijst niets.
>   De acceptatienaad (geanonimiseerd bestek erdoor → 41 regels) is hier de bewijslast.
>   Let op: dit is een uitzondering op de staande projecteis in `CLAUDE.md`, uitsluitend
>   omdat er geen UI in scope zit. `docs/goal-meerdere-tabbladen.md` dékt de screenshot-eis
>   wél — die bouwt de keuzelijst.

### Open keuze (a) — tiebreak bij deelwoord-matching

**Vraag:** `Ruimtenr.` bevat óók `ruimte` en staat in kolom A, vóór `Ruimtenaam` in kolom B;
`fabrikanttype` bevat zowel `fabrikant` als `type`. Welke regel wint?

**Aanbeveling: exact vóór deelwoord, in twee passes — en de gemeten samenstellingen gaan
als exacte sleutels de woordenlijst in.** Dus niet "langste match wint" als hoofdregel.
Waarom:

- "Langste match wint" kiest bij `ruimtenr` vs `ruimtenaam` niet vanzelf goed: béíde zijn
  deelwoord-treffers op dezelfde sleutel `ruimte`, en elke lengte-heuristiek
  (sleutellengte, dekkingsgraad) wijst daar óf willekeurig óf zelfs naar de verkeerde kolom
  (dekking `ruimte`/`ruimtenr` = 0,75 > `ruimte`/`ruimtenaam` = 0,60 → kolom A wint, fout).
- Met `ruimtenaam` als exacte sleutel is er niets te breken: de exacte pass claimt zone op
  kolom B, en de deelwoord-pass mag een al geclaimd veld niet meer binden — de treffer van
  `ruimtenr` op `ruimte` valt dood. Deterministisch, zonder negeerlijst.
- `fabrikanttype` is met deelwoorden principieel onbeslisbaar (fabrikant én type kloppen
  allebei, en geen van beide is goed: de kolom draagt merk **plus** type). De exacte sleutel
  `fabrikanttype → productText` lost het semantisch juist op: `splitBrandType` haalt het
  merk er daarna uit, precies zoals het PDF-pad (bestaand mechanisme,
  `parse-rows.ts:185-191`).
- Bínnen de deelwoord-pass geldt wél "langste sleutel wint" (per cel), als tweede-orde
  tiebreak. Zie het ontwerp voor de precieze regels.

### Open keuze (b) — blijft de ≥2-drempel in `detectHeader`?

**Vraag:** met deelwoorden haalt dit bestek 4 treffers, maar de kans op een vals-positieve
koprij in gewone datarijen stijgt. Drempel houden, verhogen, of verfijnen?

**Aanbeveling: de ≥2-drempel blijft, met één verscherping: minstens één van de treffers
moet exact zijn.** Waarom:

- Verhogen naar ≥3 breekt de minimale plakvorm (`code · aantal`) die vandaag werkt.
- Ongewijzigd laten opent een echt gat: een datarij als `["Code 12", "2", "XAL", "Type A"]`
  haalt met deelwoorden 2 treffers (`code12` begint met `code`, `typea` met `type`) en zou
  koprij worden — waarna alles erboven wegvalt.
- De verscherping sluit dat gat deterministisch: deelwoord-treffers tellen mee voor de 2,
  maar kunnen nooit zelfstandig een koprij uitroepen. Het Bos-bestand haalt na de
  woordenlijst-uitbreiding 4 **exacte** treffers, dus de meetlat haalt dit ruim.
- Consequentie (eerlijk benoemd): een bestand waarvan álle koppen alleen als deelwoord
  matchen (bijv. `Ruimtelabel` + `Typeomschrijving`, verder niets bekends) wordt niet als
  koprij gezien en valt terug op positioneel. Dat is de bewuste prijs voor geen valse
  koppen; de remedie is dan een woord toevoegen aan de lijst — één regel code.

### Voorgestelde naden

1. **Unit-naad `lib/table/parse-rows.test.ts`** (bestaande naad, uitgebreid — bestaande
   tests blijven ongewijzigd groen):
   - Bos-koprij als literal: alle 12 koppen, herkenning van zone/quantity/
     fixtureCode/productText op de juiste kolommen, koprij gedetecteerd.
   - Tiebreak vastgepind: `Ruimtenr.` (kolom A) vóór `Ruimtenaam` (kolom B) → zone bindt
     aan B, niet aan A. *(hangt af van keuze a)*
   - `Fabrikant/type`-kolom → `productText`, merk eruit gesplitst via `splitBrandType`
     (regel met "Delta Light Spy 39 …" levert brandText "Delta Light"). *(keuze a)*
   - Deelwoord-pass: onbekende kop die met een sleutel begint (bijv. `Zonenaam`) bindt
     alsnog; langste sleutel wint binnen één cel; sleutels < 4 tekens doen niet mee aan
     deelwoorden (een kop `Principe` bindt nooit `ip`). *(keuze a)*
   - Drempel: datarij `["Code 12", "2", "XAL", "Type A"]` (2 deelwoord-treffers, 0 exact)
     wordt géén koprij. *(hangt af van keuze b)*
   - Dedup op `fixtureCode + zone`: zelfde code in twee zones = 2 regels; zelfde code in
     dezelfde zone = 1 regel; zonder zone-kolom identiek aan vandaag (bestaande
     positioneel-test verandert niet).
2. **Acceptatie-naad** (nieuw testbestand naast de bestaande acceptatietests): de
   geanonimiseerde Bos-fixture (`docs/examples/test-armaturenstaat-woning.xlsx`) door het
   échte pad `rowsFromXlsx → parseSpecLinesFromRows` → exact de meetlat hieronder. Geen
   mocks; merkenlijst als literal in de test (Delta Light, Louis Poulsen, CTO, …).
3. **Geen UI-naad.** Deze feature raakt uitsluitend de parser; de Review-tab en de
   projectpagina veranderen niet. De vaste eis "white-box RSC-test met screenshots per
   feature" stel ik voor hier over te slaan — **expliciet akkoord gevraagd**, omdat de
   Werkwijze hem voor elke feature voorschrijft.

---

## Vaststaande besluiten (20 aug, Timo — niet heropenen)

1. Woordenlijst uitbreiden **plus** deelwoord-matching. Deterministisch, geen AI op
   tabelrijen (arbitrage `docs/goal-import-meer-formaten.md` blijft staan).
2. Dedup-sleutel wordt `fixtureCode + zone` (was: `fixtureCode` alleen), zodat hetzelfde
   armatuurtype in verschillende ruimtes aparte regels blijft. Sluit aan op de
   zone-subtotalen die `lib/repo/estimate.ts` (groupByZone) al kan.
3. Testfixture: geanonimiseerde kopie van het Bos-bestand in de repo; het echte bestand
   (klantnaam, adres, opdrachtgever) gaat niet in git.

## Ontwerp

Alles speelt zich af in `lib/table/parse-rows.ts`. De aanroepers
(`finishTableImportAction` en `importTabelRowsAction` in `app/projects/actions.ts`, plus
`recordTableImport`) veranderen niet; het positionele pad (geen koprij) verandert niet.

### 1. Woordenlijst uitbreiden (exacte sleutels)

Toevoegen aan `HEADER_KEYS`, op genormaliseerde vorm zoals vandaag:

| Nieuwe sleutel | Veld | Waarom |
|---|---|---|
| `ruimtenaam` | `zone` | gemeten in het Bos-bestand |
| `codering` | `fixtureCode` | gemeten in het Bos-bestand |
| `fabrikanttype` | `productText` | gemeten; gecombineerde kolom → splitBrandType haalt het merk eruit |
| `fabricaattype` | `productText` | zelfde patroon, NL-variant die in bestekken voorkomt |
| `merktype` | `productText` | zelfde patroon |

Bewust **niet** toegevoegd: `ruimtenr`/`ruimtenummer`. Een negeerlijst is overwogen en
verworpen: zodra `ruimtenaam` exact claimt is de botsing al weg, en in een bestand met
alléén een `Ruimtenr.`-kolom is een ruimtenummer als zone geen fout maar precies wat de
bestekschrijver als ruimte-aanduiding gebruikt. `soort`, `functie`, `toelichting`,
`accessoire`, `powersupply` en `montagewijze` blijven onherkend — die kolommen dragen geen
veld dat wij hebben, en dat is correct gedrag, geen omissie.

### 2. Deelwoord-matching in twee passes (keuze a)

`headerHits` wordt herschreven naar twee passes over de rij:

- **Pass 1 — exact** (het huidige gedrag, met de uitgebreide lijst):
  `HEADER_MAP.get(norm(cell))`; per veld wint de eerste kolom, zoals vandaag.
- **Pass 2 — deelwoord**, alleen voor velden die pass 1 niet claimde en cellen die pass 1
  niet bond: een cel matcht een sleutel als `norm(cell)` **begint met** die sleutel
  (prefix, geen substring) én de sleutel **≥ 4 tekens** heeft. Binnen één cel wint de
  langste matchende sleutel; per veld wint daarna de eerste kolom.

Verantwoording van de twee begrenzingen:

- **Prefix, geen substring.** Substring-matching maakt korte sleutels giftig: `opdracht`
  bevat `ra`, `principe` bevat `ip`. Prefix houdt de nuttige gevallen (`ruimtenaam`,
  `zonenaam`, `typenummer`, `codering`) en sluit die klasse ongelukken structureel uit.
  Beperking die we accepteren: een kop als "Naam ruimte" (sleutel niet vooraan) matcht
  niet — daarvoor is de woordenlijst de route.
- **Minimum 4 tekens.** `ip`, `ra`, `cri`, `cct` en `qty` doen alleen exact mee. De kortste
  deelwoord-sleutels zijn dan `code`, `type`, `zone`, `merk`, `room` — elk specifiek genoeg
  als prefix.

Uitgewerkt op de gemeten Bos-koprij (rij 8):

| Kop | Pass | Veld |
|---|---|---|
| Ruimtenr. | deelwoord-treffer op `ruimte`, maar zone is al exact geclaimd | — |
| Ruimtenaam | exact | `zone` |
| Toelichting | — | — |
| Aantal | exact | `quantity` |
| Functie | — | — |
| Codering | exact | `fixtureCode` |
| Soort | — | — |
| Fabrikant/type | exact (`fabrikanttype`) | `productText` |
| Accessoire / Power supply / Montagewijze | — | — |

Vier exacte treffers → koprij herkend; merk komt per regel uit `splitBrandType` op de
`Fabrikant/type`-waarde, met dezelfde merkenlijst als het PDF- en OCR-pad.

### 3. Drempel in `detectHeader` (keuze b)

De scan blijft: eerste rij binnen de eerste 10 met genoeg treffers. De eis wordt:
**totaal ≥ 2 treffers (exact + deelwoord samen), waarvan minstens 1 exact.** Deelwoorden
verbreden dus wél de kolomherkenning van een echte koprij, maar kunnen nooit alleen een
datarij tot koprij bombarderen. Het bestaande commentaar bij de drempel ("Type komt ook in
gewone cellen voor") blijft waar en wordt aangevuld met deze regel.

### 4. Dedup-sleutel `fixtureCode + zone`

In `parseSpecLinesFromRows` wordt de `seen`-sleutel `fixtureCode` + een scheidingsteken dat
niet in celtekst kan voorkomen (`"\u0000"`) + de getrimde zone (lege/ontbrekende zone =
lege string). Gevolgen, gemeten aan het Bos-bestand: 41 dataregels, 32 unieke codes, en
alle duplicaten (`Wand` 3×, `Plint` 2×, codes 9/12/19/20/21/32 elk 2×) zitten in
verschíllende ruimtes → 41 regels blijven staan. Zelfde code in dezélfde zone blijft
dedupliceren (eerste rij wint), en zonder zone-kolom is het gedrag byte-voor-byte het
huidige. Buiten scope: de `seen`-set in `parseTocText` (PDF-inhoudsopgave,
`lib/pdf/armaturenboek.ts`) — daar bestaat geen zone en verandert niets.

### 5. Testfixture

- `scripts/gen-test-armaturenstaat.ts` (patroon van `gen-test-armaturenboek.ts`): bouwt
  met exceljs een werkboek met exact de structuur van het Bos-bestand — kopregels
  (`Project:`, `Opdrachtgever:`, `Betreft:`, `Projectnr.:`) met **verzonnen** projectnaam,
  adres en opdrachtgever; de identieke koprij op rij 8; de tussenkopjes `BEGANE GROND`,
  `VERDIEPING`, `BUITEN` en `Aantallen`; en alle 41 dataregels met de echte coderingen,
  zones, aantallen en fabrikant/type-waarden (productdata is geen klantdata). Het script
  ís de anonimisering: reviewbaar in git, en de fixture is reproduceerbaar.
- Output vastgelegd als `docs/examples/test-armaturenstaat-woning.xlsx` (naast de
  bestaande voorbeeldbestanden). Het echte Bos-bestand blijft buiten de repo.

## Meetlat

Het geanonimiseerde Bos-bestand, door `rowsFromXlsx → parseSpecLinesFromRows` met de
merkenlijst:

- **41 spec-regels** (nu: 9, waarvan geen enkele een armatuur is);
- koprij herkend op rij 8 van het bestand;
- élke regel heeft `zone` gevuld uit de kolom **Ruimtenaam** en `fixtureCode` uit
  **Codering**;
- steekproef op de inhoud: de Spy 39-regels tellen samen op tot 53 stuks, en de regels
  voor Heli X (2), NIME II (2), Louis Poulsen Toldbod (3) en CTO Trevi (1) zijn aanwezig
  met merk correct gesplitst uit Fabrikant/type;
- de volledige bestaande testsuite blijft groen zonder wijziging aan bestaande
  verwachtingen (de dedup-wijziging raakt geen bestaande test: die dedupliceren zonder
  zone en dat gedrag is ongewijzigd).

## Buiten scope

- Geen AI-pad, geen wijziging aan de leesroute of het docx-vrije-tekst-fallbackpad.
- Geen UI-wijziging; Review-tab, matcher en events blijven zoals ze zijn (de import logt
  dezelfde events, met vanzelf betere aantallen in de payload).
- Geen wijziging aan het positionele pad of aan `parseTocText` (PDF).
- Geen melding richting gebruiker over gededupliceerde rijen — dat is
  `docs/probleem-liegende-import-melding.md`-terrein en na deze fix vrijwel leeg.

## Gemeten resultaat (na het bouwen invullen)

- [ ] Meetlat gehaald: … van 41 regels
- [ ] Niet gehaald / open eindes: …
