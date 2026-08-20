# Goal: vervallen producten vindbaar, plus een driver-waarschuwing

> Probleem: `docs/probleem-vervallen-producten.md`. Besloten in de demosessie met Brink Licht
> (12 aug 2026), door Timo bevestigd 19 aug 2026. `/grill-me` bewust overgeslagen — de
> beslissing was al genomen.

## Deel 1 — ijzeren regel 3 wordt herschreven

Oud: *"Verlopen prijslijst = product onzichtbaar in álle zoekresultaten (centraal afgedwongen)."*

Nieuw: *"Verlopen prijslijst = product zichtbaar zonder prijs. Nooit een prijs tonen uit een
verlopen lijst; altijd rood gemarkeerd, altijd met de melding welke prijslijst de laatst bekende
was. Centraal afgedwongen."*

De bescherming blijft identiek — er mag nooit geoffreerd worden op verouderde prijzen. Wat
verandert is dat verbergen plaatsmaakt voor expliciet melden.

## Deel 2 — de view krijgt een prijstoestand

`visible_products` gaat van "producten met een geldige prijs" naar "producten waarvan we een
prijs kennen of ooit kenden", met de toestand erbij. Drie waarden, gesloten:

| `price_state` | Wanneer | Prijs | Melding |
|---|---|---|---|
| `actueel` | geldige prijsregel in een lopende lijst | ja | geen |
| `prijslijst_verlopen` | prijsregel in een lijst waarvan `valid_until` voorbij is | **nee** | "price list of \<merk\> expired on \<datum\>" |
| `uit_prijslijst` | geen prijsregel meer, wél een rij in `archive.prices_archive` | **nee** | "no longer included in the price list of \<datum\>" |

Besluiten:

1. **Geen prijs betekent NULL in de view, niet "de UI toont hem niet".** `gross_price`,
   `currency`, `price_list_id` en `valid_until` zijn NULL zodra `price_state <> 'actueel'`.
   Dat is de centrale afdwinging: geen enkele consument kan een verlopen bedrag tonen, ook niet
   per ongeluk. Het sluit meteen het staffel-lek (`lib/repo/staffel.ts:86` bindt op
   `price_list_id`) zonder dat daar code voor nodig is.
2. **De laatst bekende lijst krijgt eigen kolommen**: `last_price_list_name` en
   `last_price_list_valid_until`. Ook gevuld bij `actueel` (dan is het de lopende lijst) —
   één betekenis per kolom, geen "soms wel, soms niet". Het merk staat al op de rij
   (`brand_name`), dus daar komt geen derde kolom bij.
3. **Nooit-geprijsd blijft onzichtbaar.** Een product zonder enige prijsregel én zonder
   archiefrij komt niet in de view. Anders zouden 200k+ nooit-geprijsde rijen de catalogus
   overspoelen, en de negatieve controle van het testmerk (`ZZTEST-LL14-0003`, bewust zonder
   prijs) zou zijn betekenis verliezen. "Zichtbaar" blijft "wij kennen de prijs, of kenden hem".
4. **Eén prijsregel per product wint.** Een product kan rijen in meerdere lijsten hebben. De
   view kiest per product: geldig boven verlopen, en daarbinnen de hoogste `valid_until`. Zo
   blijft de view één rij per product, precies zoals elke consument nu aanneemt.
5. **Alternatieven-suggesties blijven prijsbaar.** `getEquivalentAlternatives`
   (`lib/repo/equivalence.ts`) filtert op `price_state = 'actueel'`. Een alternatief dat je niet
   kunt offreren voorstellen is erger dan geen alternatief. Zoeken en matchen tonen vervallen
   producten wél — dáár is de hele wijziging voor. Het AI-vangnet valt bewust in die tweede
   groep: het zoekt hét gevraagde artikel, en dat is precies het artikel dat vervallen kan
   zijn. Zie de opvolgtaak in `HANDOVER.md` — het model krijgt de toestand (nog) niet te zien.
6. **`catalogBrandsQuery` (`lib/repo/catalog.ts`) beweegt mee.** Dat is het enige duplicaat van
   het datumpredicaat buiten de view; de test die de uitkomsten gelijkstelt blijft de bewaker.

### Wat er ná deze wijziging niet meer werkt

Het testmerk `ZZTEST QA-14` was uitgezet dóór de prijslijst te laten verlopen. Die aan/uit-knop
bestaat niet meer. `products.status` (`'actief'` default) is de juiste vervanger, maar de view
filtert daar vandaag niet op — en dat alsnog toevoegen is een tweede zichtbaarheidsregel in
dezelfde wijziging. **Niet meegenomen; genoteerd in `HANDOVER.md` als opvolgtaak met de
handeling die nodig is.**

## Deel 3 — driver-waarschuwing

Geen koppeling, geen gok over wélke driver. Alleen: *dit merk voert losse drivers en
accessoires, controleer of er iets bij hoort.*

7. **Het signaal is merk-breed en afgeleid, niet opgeslagen.** Een merk "voert losse
   onderdelen" als het ≥ 3 producten heeft waarvan de naam met een onderdeelwoord begint. De
   regex is `ONDERDEEL_START` uit `lib/enrichment/verdenking.ts` — verankerd aan het begin,
   gemeten op 453 echte onderdelen tegen 3.700 valse positieven voor de niet-verankerde
   variant. Die regex wordt geëxporteerd en in Postgres hergebruikt met `~*`, zodat er één bron
   blijft; een test bewijst dat SQL en TypeScript op dezelfde namen hetzelfde zeggen.
   Drempel 3 omdat één losse treffer een parse-artefact kan zijn; de vijf merken die er in de
   meting werkelijk uitspringen (197/110/82/38/21 onderdelen) liggen er ruim boven.
8. **De waarschuwing verschijnt bij een armatuur, niet bij een onderdeel.** Een regel die
   zelf een driver is krijgt hem niet — dan is de vraag al beantwoord.
9. **Terughoudend, en dat betekent per scherm anders.** Op een regel-detailscherm (één armatuur
   in beeld) staat hij inline bij de regel. Op de offerte staat hij **één keer**, gegroepeerd
   over de betrokken merken — een waarschuwing op elk van veertig regels leert iedereen hem
   wegkijken, en dat is precies de faalmodus die de klant beschreef.

## Meetlat

- Zoeken op het artikelnummer van een product met een verlopen prijslijst geeft een treffer,
  rood, zonder bedrag, met de naam en einddatum van de laatst bekende lijst.
- Zoeken op een product dat uit de nieuwe lijst is gevallen geeft een treffer met de ándere
  melding.
- Geen enkel codepad kan een bedrag uit een verlopen lijst tonen — bewezen op de view, niet
  op de UI.
- Een offerte met armaturen van Wever & Ducré toont één driver-waarschuwing; een offerte met
  alleen armaturen van een merk zonder losse onderdelen toont er geen.
- White-box RSC-tests met screenshots (light/dark × mobile/desktop) voor elk gewijzigd scherm.

## Resultaat (19 aug 2026)

Gebouwd en getest. De poort staat in `db/migrations/0022_vervallen_zichtbaar.sql`; de
volledige lijst aannames en opvolgtaken staat in `HANDOVER.md` onder "Ijzeren regel 3
herschreven".

**Gemeten op de meetlat hierboven** (PGlite-tests met exact dezelfde migraties als Neon):

| Meetpunt | Waar bewezen |
|---|---|
| Zoeken op het artikelnummer van een product met een verlopen prijslijst geeft een treffer, zonder bedrag, met de laatst bekende lijst | `lib/repo/rules.test.ts` — "exacte SKU-match vindt het vervallen product" |
| Uit de nieuwe lijst gevallen geeft de ándere melding | `lib/repo/rules.test.ts` — "uit de nieuwe prijslijst gevallen is een ándere toestand" |
| Geen enkel codepad kan een bedrag uit een verlopen lijst tonen | Bewezen op de VIEW: `gross_price`, `currency`, `price_list_id`, `valid_until` zijn NULL zodra `price_state <> 'actueel'` (`lib/repo/price-archive.test.ts`, `lib/repo/brand-relations.test.ts`, `lib/repo/template-import.test.ts`) |
| De matcher levert een vervallen product als kandidaat, zonder prijs | `lib/matching/engine.test.ts` — "regel 3 herschreven: een verlopen product wordt gewoon een kandidaat" |
| Een merk met losse drivers levert één waarschuwing; een merk zonder niet | `lib/repo/onderdeel-merken.test.ts` |
| TS-regex en Postgres-regex zeggen hetzelfde | `lib/repo/onderdeel-merken.test.ts` — 19 namen, beide kanten |
| White-box RSC-tests met screenshots (light/dark × mobile/desktop) | `components/vervallen-markering.test.tsx` (nieuw), `components/catalog.test.tsx`, `components/dossier/regel-detail.test.tsx` |

**Wat er niet gehaald is:**

1. **De aan/uit-knop van het testmerk is gesneuveld.** `ZZTEST QA-14` stond in productie uit
   dóór zijn prijslijst te laten verlopen. Die knop bestaat niet meer; twee producten worden
   weer vindbaar. `products.status` is de vervanger, maar de view filtert daar niet op en dat
   toevoegen zou een tweede zichtbaarheidsregel in dezelfde wijziging zijn. Handeling en
   alternatief staan in `HANDOVER.md`.
2. **`scripts/import.ts` is niet aangesloten op het archief.** `replacePriceList` wordt wél
   aangeroepen vanaf het template-importpad (`lib/repo/template-import.ts:494`), dus de
   toestand `uit_prijslijst` ontstaat daar. Het `bun run import`-pad kent het archief niet en
   houdt zijn hardgecodeerde `valid_until`; die 211k producten zullen dus alleen ooit
   `prijslijst_verlopen` worden, nooit `uit_prijslijst`. Eigen opdracht.
3. **Geen browserverificatie.** Deze worktree heeft geen `DATABASE_URL`, dus `bun dev` kan
   niet draaien. Het bewijs komt uit de RSC-screenshots en de PGlite-tests.
4. **Het AI-vangnet ziet de toestand niet.** Het vindt vervallen producten (gewenst), maar
   het model krijgt `price_state` niet in zijn tool-uitvoer; dat zou de tool-schema's en de
   prompt raken. De mens die de suggestie beoordeelt ziet de markering wél.
