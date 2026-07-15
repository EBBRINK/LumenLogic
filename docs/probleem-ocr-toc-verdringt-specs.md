# Probleem: OCR pakt inhoudsopgave, verdringt echte specs (2026-07-15)

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

Zonder gevraagde specs heeft de tolerantietabel niets om op af te wijzen — velden
worden "onbekend" in plaats van "rood". Voor SASSO 100-regels (die Brink alléén in
2700K/CRI90 voert, terwijl het boek 3000K/4000K vraagt) leidde dit tot **groen**
i.p.v. het terecht **rood** dat mijn handmatige analyse (met volledige specs)
opleverde. Dat is geen kosmetisch verschil — het is de kern van wat de matcher moet
doen.

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
