# Probleem: OCR pakt inhoudsopgave, verdringt echte specs (2026-07-15)

## Status: opgelost

Branch `fix-ocr-toc-specs`, vier commits:
- `c7a458d` — item C: `parseProductName` draait over `ruweTekst`+`type`, niet alleen `type`.
- `6dcad0c` — eerste spookmatch-fix-poging, in review AFGEKEURD (zie hieronder).
- `2766ba6` — definitieve spookmatch-fix: het oude product rechtstreeks tegen de nieuwe
  gevraagde specs toetsen, los van elke kandidatenlijst/limiet.
- `958f253` — acceptatietest die het echte SASSO/RET-Waalhaven-scenario reproduceert en
  de fix bewijst.

Drie reviewrondes op de spookmatch-vergelijking, telkens afgekeurd op een concreet gat:
1. **Ronde 1** (vóór `6dcad0c`): plan vergeleek het oude `matchedProductId` alleen tegen
   `outcome.unambiguousYellow` (alleen gezet bij status 'geel') — zou elke nog kloppende
   **groene** match bij een upgrade onterecht hebben losgekoppeld. Afgekeurd vóór het
   werd gebouwd/aangescherpt.
2. **Ronde 2** (`6dcad0c`): uitgebreid naar "staat de oude match in `outcome.provable`
   óf gelijk aan `outcome.unambiguousYellow`?" — maar beide zijn afgeleid van de
   top-N (default `limit=8`) kandidaten van `fetchCandidates`. Bij >8 matchende
   kandidaten in de 211k-catalogus kon een nog geldige, mens-gekozen match buiten die
   top-8 vallen en zou dan alsnog onterecht als "spookmatch" gewist worden
   (top-8-blinde-vlek). Afgekeurd in review.
3. **Ronde 3** (`2766ba6`, definitief): het oude product wordt rechtstreeks tegen de
   nieuwe gevraagde specs getoetst via `judgeCandidate`/`toDelivered` op één
   `visibleProducts`-rij, volledig onafhankelijk van elke kandidatenlijst/limiet.
   Geaccepteerd; getest met 9 decoy-producten die de mens-gekozen match gegarandeerd
   buiten de standaard top-8 drukken (`958f253`).

Zie "Item A: rijkste-wint-dedup" in `HANDOVER.md` voor de volledige technische
toelichting en het geaccepteerde race-risico (geen `db.transaction()` mogelijk op
`neon-http`).

## Wat er gebeurde

Timo uploadde het echte RET-Waalhaven-boek (Deerns, 31 pagina's, geen tekstlaag) op
productie. OCR draaide door tot einde, binnen budget (€0,10, 31 llm_usage-rijen),
26 regels aangemaakt, geen fouten. Op het eerste gezicht een succesvolle run.

Onafhankelijke verificatie (Timo las het hele boek zelf, ik draaide zijn 26 regels
handmatig door de echte matcher) legde een gat bloot: **elke OCR-regel heeft
`reqKelvin`/`reqCri`/`reqWatt`/`reqLumen` = null.** Geen enkele numerieke spec is
doorgekomen, terwijl elke fixture-pagina in het boek ze gewoon toont ("Vermogen:
17,9 W", "Kleurtemperatuur: 3000 K", "CRI: ≥ 90").

## Oorzaak

Dit boek heeft twee soorten pagina's:
1. **Inhoudsopgave** (pagina's 2-3): een tabel met kolommen Armatuurcode | Merk |
   Type | Bladzijde — géén specs, alleen een paginaverwijzing.
2. **Detailpagina per fixture** (pagina's 4-29): wél alle specs, in een
   "Armatuur details"/"Lichtbron"-paneel.

De vision-stap leest de inhoudsopgave het eerst (staat vooraan) en herkent de rijen
daar — volkomen terecht, want ze zien er precies uit zoals de prompt "een rij"
beschrijft (code, merk, type). Elke regel krijgt zo een `rawText` als letterlijk
`"Lp301   XAL   SASSO 100   8"` — dat laatste getal is het **paginanummer uit de
inhoudsopgave**, geen spec.

Wanneer de échte detailpagina van diezelfde code later langskomt (met alle cijfers
erbij), ziet de dedup-logica in `lib/repo/ocr.ts` (`processOcrPage`) dat de
armatuurcode al bestaat in `run.rows` (van de inhoudsopgave) en verwerpt de nieuwe,
rijkere lezing als duplicaat. **De eerste (armste) lezing wint altijd, de specs
komen nooit door.**

Bijkomend: `regelToSpecLine` (`lib/repo/ocr.ts`) roept `parseProductName()` alleen
aan op het korte `type`-veld, nooit op `ruweTekst` — dus zelfs zónder de dedup-bug
zouden specs die wél in `ruweTekst` staan, genegeerd worden bij het vullen van
`reqKelvin`/`reqWatt`/etc.

## Gevolg voor de matcher

Zonder gevraagde specs genereert de tolerantietabel voor die velden helemaal geen
deviation — niet "onbekend", maar afwezig. `judgeCandidate` (`lib/matching/
tolerances.ts`) geeft het kelvin-veld pas door aan `judgeKelvin` als `req.kelvin !=
null` (zelfde patroon voor cri/watt/lumen/etc.); bij `reqKelvin = null` wordt er dus
geen kelvin-deviation aangemaakt, in geen enkele richting. Voor SASSO 100-regels (die
Brink alléén in 2700K/CRI90 voert, terwijl het boek 3000K/4000K vraagt) leidde dit tot
**geen zichtbare mismatch** — het eindresultaat (vóór de fix: geen afwijking te zien,
dus mogelijk ten onrechte **groen**) klopt, alleen het mechanisme hierboven was eerder
verkeerd benoemd als "onbekend"/"rood". Dat is geen kosmetisch verschil — het is de
kern van wat de matcher moet doen.

## Dit boek is niet uniek

Eén-pagina-per-fixture-met-detailpaneel is een veelvoorkomend Deerns/DO-formaat.
Elke keer dat een boek een inhoudsopgave vóór de detailpagina's heeft, treft dit
probleem op. Boeken zonder inhoudsopgave (specs direct per rij) raakt dit niet.

## Openstaand: oplossingsrichting (nog geen besluit)

Twee routes, niet wederzijds uitsluitend:
- **A — dedup slimmer maken:** bij een botsende armatuurcode niet de eerste lezing
  laten winnen, maar de rijkere (meer gevulde specs/langere ruweTekst) — of expliciet
  "opvolgen" i.p.v. "verwerpen": vul ontbrekende velden bij uit de latere lezing.
- **B — inhoudsopgave-pagina's herkennen en overslaan** voor spec-doeleinden (wel
  gebruiken om te weten hoeveel fixtures er zijn / als crosscheck), zodat alleen
  detailpagina's specs mogen leveren.
- **C — regelToSpecLine parseProductName ook op ruweTekst laten draaien**, niet
  alleen op `type` — nodig zodra A of B de rijkere tekst laat doorkomen.

Fase 2 (plan + reviewer) moet dit uitwerken vóór er gebouwd wordt.

## Besluit fase 2 (plan-agent + kritische reviewer, 2026-07-15)

**Kern: A (rijkste-wint-dedup) + C (parseProductName over `ruweTekst`+`type`).**
B (inhoudsopgave-pagina's herkennen) bewust niet gebouwd — lost het kernprobleem
niet op (zelfs met perfecte classificatie is een "rijkste wint"-regel nog steeds
nodig) en voegt een nieuwe faalmodus toe. Blijft open vervolgidee.

**Rijkdom** = aantal niet-null gevraagde specvelden (kelvin/cri/ip/watt/lumen/
beamAngle/dimmable) — bewust niet ruweTekst-lengte. Bij gelijke rijkdom (ties)
blijft de bestaande lezing staan (geen onnodige churn).

**Twee blokkerende gaten uit de reviewronde, verwerkt in het bouwplan:**
1. **Spookmatch:** `runMatcher` laat `matchedProductId` ongemoeid tenzij er een
   nieuwe automatische (auto-yellow) kandidaat is — een regel die een mens al
   groen maakte (accepteer/variant/link) kan na upgrade rood worden terwijl de
   oude match-koppeling blijft hangen, en verdwijnt daardoor uit de "handmatig
   linken"-werkvoorraad (`getRedLinkLines` filtert op `matchedProductId IS NULL`).
   **Fix:** ná `runMatcher` in het upgrade-pad expliciet vergelijken of de nieuwe
   evaluatie dezelfde kandidaat koos; zo niet, `matchedProductId` expliciet naar
   null zetten.
2. **Verloren audit-spoor:** `runMatcher` verwijdert en herbouwt alle
   `spec_line_candidates` zonder een eerdere `chosen`/`chosenBy`/`chosenReason` te
   bewaren. **Fix:** vóór het herdraaien van de matcher de oude chosen-informatie
   (product, wie, waarom) uitlezen en meesturen in het `ocr_line_upgraded`-event —
   zodat niets stilzwijgend verdwijnt uit het logboek, ook al kan de directe
   database-koppeling niet overleven.

**Overige reviewer-punten verwerkt:**
- Numeric-conversie (`String(...)` voor `reqWatt`/`reqBeamAngle`) expliciet
  meenemen in de eigen kleine update — dezelfde conventie als `addSpecLines`/
  `updateSpecLine`.
- Race tussen twee overlappende pagina-verwerkingen van dezelfde run/code: geen
  nieuwe unique-constraint/migratie hiervoor — zelfde geaccepteerd-risico-patroon
  als eerder in dit project (single-user, sequentiële client-loop maakt een echte
  gelijktijdige aanroep voor dezelfde run praktisch onmogelijk). Wél de
  lees-vergelijk-schrijf-stap in één `db.transaction()` wikkelen (correct sowieso,
  geen migratie nodig). Expliciet als geaccepteerd risico in HANDOVER.md.
- Testplan uitgebreid met: mens had de arme lezing al goedgekeurd → upgrade →
  `matchedProductId` wordt schoon, event bevat de oude keuze-informatie.

**Openstaande vraag voor Timo (niet automatisch bouwen):** de al-bestaande
productie-run (`e884d939-3341-464a-b0c5-2537e44400fc`, 26 regels zonder specs)
blijft ongewijzigd — deze fix werkt alleen vooruit. Opnieuw uploaden van hetzelfde
boek start een nieuwe run en zou dubbele armatuurcodes in het dossier geven (de
upgrade-logica is bewust per-run gescoped). Eerst de 26 bestaande regels
verwijderen en dan opnieuw uploaden, of een aparte "vervang-run"-functie bouwen —
apart te beslissen.

Volledig plandocument: zie sessielog 2026-07-15 (plan-agent-uitvoer). Bouwstappen:
1) alleen C (parseProductName op ruweTekst+type), 2) A (richness/upgrade-logica +
spookmatch-fix + audit-bewaring, in transactie), 3) geïsoleerde acceptatietest
(mens-had-al-gekozen-scenario + SASSO-scenario), 4) documentatie/HANDOVER.

## Toegepast (branch `fix-ocr-toc-specs`)

- Item C: commit `c7a458d` (parseProductName over ruweTekst+type).
- Item A (rijkste-wint-dedup): commit `9c4c440` (`specRichness`/`getOwnOcrLine`/
  `upgradeOcrLine` in `lib/repo/ocr.ts`, `ProcessOcrPageResult.upgraded`).
- Spookmatch-vergelijking tweemaal aangescherpt na onafhankelijke review:
  1. `9c4c440` vergeleek uitsluitend tegen `outcome.unambiguousYellow` — liet
     elke nog kloppende groene match (bereikbaar via `chooseCandidateAction`)
     onterecht loskoppelen. Gefixt in de eropvolgende commit door ook
     `outcome.provable` mee te nemen.
  2. Die `provable`-vergelijking bleek zélf nog een gat te hebben: `provable`/
     `unambiguousYellow` zijn afgeleid van de top-N (default `limit=8`,
     `evaluateSpecLine`) kandidaten van `fetchCandidates` — bij >8 matchende
     kandidaten in de 211k-catalogus kan een nog geldige match daar toevallig
     buiten vallen (top-8-blinde-vlek) en zou dan alsnog onterecht gewist
     worden. **Definitieve fix** (deze commit): het oude product rechtstreeks
     tegen de nieuwe gevraagde specs toetsen via `judgeCandidate`/`toDelivered`
     op één `visibleProducts`-rij (regel 3: verlopen prijslijst = onzichtbaar),
     los van elke kandidatenlijst/limiet. `toDelivered`/`SELECTION`
     (`lib/matching/engine.ts`) en `specRequestFromLine`
     (`lib/repo/matching.ts`) zijn daarvoor geëxporteerd (geen gedragswijziging,
     alleen zichtbaar gemaakt). Getest met een catalogus van 9 decoy-producten
     die de mens-gekozen match gegarandeerd buiten de standaard-top-8 drukken.
  `db.transaction()` bleek geen optie (`drizzle-orm/neon-http` ondersteunt geen
  interactieve transacties); zie HANDOVER.md voor de volledige toelichting van
  het geaccepteerde race-risico.
