# Probleem: de import leest echte armaturenboeken verkeerd

> Fase 1 van de werkwijze (probleem uitschrijven), 16 jul 2026. Gemeten op vier echte
> klantaanvragen uit XIS met Jayden's offertes als grondwaarheid. Volledige meting:
> `docs/lumenlogic-sprintplan-augustus.md` §"Uitkomst van de meting" + §"Wat de evaluatieset
> blootlegde". Rapport voor Timo: `~/Downloads/lumenlogic-testset/BEVINDINGEN.html`.

## De uitkomst in één regel

Vier echte aanvragen, **nul matches** — terwijl de catalogus alles bevatte wat Jayden
offreerde (XAL 31.420 producten, Aromas 1.986, &Tradition 539, Muuto 276). Er is geen
datagat; er is een leesprobleem.

## De vastgestelde oorzaken (elk geverifieerd, met bestand:regel)

**O1 — De merkkolom wordt geraden.** `lib/pdf/armaturenboek.ts:72`: "geen bekend merk
herkend: eerste woord als merk". Werkt op een smalle inhoudsopgave (Deerns-TOC), pakt op een
brede tabel de verkeerde kolom. Gevolg bij Raadhuis: merk = "Raadzaal"/"Toilet"; bij TNO:
merk = "Woonkamer"/"Vergaderruimte" — en de estimate vraagt de binnendienst die "merken" in
te laden. **Bewezen (trouwe hermeting): repareer alléén dit en alle vier Raadhuis-regels gaan
van blauw naar geel/open mét kandidaten.** Dit is de hoofdoorzaak van match 0/31 en 0/15.

**O2 — De CODE-regex kent één huisstijl.** `lib/pdf/armaturenboek.ts:14`:
`/^[A-Z][a-z]{1,2}\d{2,3}(?:-[a-z0-9])?$/` — alleen Deerns' `Lp301` past. KvK's `L004`: 0/28
import. TNO's `Lr001B`/`Lp601a`/`Lr001_N`: 5 codes opgeslokt in de regel erboven. Dordrechts
`Ad`/`C1`/`Tn1`: 0/18. ⚠️ `lib/ai/ocr.ts:48` importeert dezelfde regex (bewust, "parser en
vision nooit uiteenlopen") — de OCR erft de blinde vlek, al degradeert het daar alleen het
vertrouwen i.p.v. te blokkeren. **Verruimen is bewezen onvoldoende**: twee testregexen bleken
twee tegengestelde blinde vlekken te hebben. Codes zijn niet met één patroon te vangen.

**O3 — OCR-antwoord wordt afgekapt en stil weggegooid.** `lib/ai/ocr.ts:60`
`MAX_TOKENS_PER_PAGE = 1500`; de Dordrecht-pagina had 2141 nodig. `stop_reason` wordt
doorgegeven maar nergens getoetst; `parseLeverRegels` levert dan stil `[]`, en de prompt zegt
"An empty list is a good answer". **Stil totaalverlies van 18 regels voor €0,01**, niet te
onderscheiden van een blanco pagina. Zelfde bug-klasse als de 0.1b-parserfix (stille lege
lijst); de tripwire uit 0.1b (`parseFailed`-teller) is het bewezen patroon.

**O4 — De OCR-resolutie is een A4-instelling op A3-boeken.** Beeld gaat op 1568px lange
zijde naar de vision-call. Op een volle A3 verzint het model **8 van de 18 merken**
(SERAX→"Trilux", QAZQA→"GAZOO", Aromas del Campo→"Artemide Dark Canope") — plausibele onzin
ondanks "Never invent" in de prompt. Zelfde model + prompt op een 300dpi-uitsnede van de
tabel: **18/18 perfect**, alle merken correct. De API schaalt zelf terug naar ~1568px, dus
groter versturen helpt niet — de pagina moet in stukken (tiling/crop).

**O5 — `brandExists` toetst de merkrij, niet de producten.** `lib/matching/engine.ts:176`.
Gevolg 1: rood/blauw hangt af van of een zaalnaam toevallig een merkrij raakt ("Focus", 0
producten → rood; "Vergaderruimte" → blauw), strijdig met `docs/matching-regelset.md:77-79`
("ontbrekend merk in de data = BLAUW"). Gevolg 2: "Aromas del Campo" (zoals het boek het
schrijft) faalt waar "Aromas" (catalogusnaam) slaagt — een merknaam-mismatch wordt "merk
onbekend". De code-comment verdedigt terecht het verlopen-prijslijst-geval; het gat is dat
"nooit producten gehad" en "tijdelijk onzichtbaar" niet te onderscheiden zijn.

**O6 — Het toolschema kent geen aantallen.** Vier velden (`armatuurcode`, `merk`, `type`,
`ruwe_tekst`); `lib/repo/ocr.ts:596` zet `quantity: null` hard, comment: "een
armaturenboek-pagina noemt geen aantallen" — precies de aanname die Dordrecht weerlegt
(handgeschreven aantallen in de kantlijn, door vision **15/15 correct** gelezen, incl. de
tegen de offerte geverifieerde 124). A-07 (stukprijs-modus) is een keuze geweest, geen
natuurwet.

## Expliciet GEEN vastgestelde oorzaak

- **De top-8-afkap van de matcher** — ingetrokken na hermeting. In de echte runs wordt
  `fetchCandidates` nooit bereikt (alles strandt eerder, op O1). `engine.ts:250` sorteert op
  relevantie; naam is alleen tiebreak. Of de top-8 knelt is een **aparte meting ná de
  O1-fix**, geen onderdeel van dit probleem.
- **Het handschrift** — vision leest het foutloos. Alleen het schema (O6) blokkeert.
- **De catalogus** — gevuld; geen datagat.

## Bekende feiten die elk plan moet respecteren

- Ijzeren regels 1–5 (CLAUDE.md), i.h.b. regel 2 (geld nooit in de ranking, met test) en
  regel 3 (alleen `visible_products`).
- `CODE` wordt gedeeld door tekstroute én OCR (`ocr.ts:48`, toetsing op :249) — een wijziging
  raakt beide; dat koppelcontract is bewust, dus breek het niet stilzwijgend.
- De acceptatietest (`tests/acceptatie-aanvraag-estimate.test.ts`) draait de hele keten op
  het gegenereerde `docs/examples/test-armaturenboek.pdf` (Deerns-stijl) — elke parserwijziging
  moet die groen houden én zou eigenlijk fixtures in de nieuwe stijlen moeten krijgen.
- Testmateriaal met grondwaarheid ligt klaar: `~/Downloads/lumenlogic-testset/`
  (Raadhuis 31 codes / KvK 20 / TNO 20 / Dordrecht 18, elk met Jayden's offerte).
- 0.1b's tripwire-patroon (event + teller i.p.v. stille lege lijst) is het huispatroon voor
  O3-achtige gevallen.
- LLM-budget: €10/maand cap, verbruik ~€0,41. OCR-metingen kosten ~€0,01–0,02/pagina.
- Vercel: `after()` werkt (bewezen 0.1); functielimiet 300 s, Fluid compute aan.

## Wat een plan moet opleveren

Gevraagd: een bouwplan dat de zes oorzaken adresseert (of beargumenteerd uitstelt), in een
volgorde die per stap meetbaar is tegen de vier testcases, passend binnen de weekplanning
(vault-sprintplan: deze week "estimate helemaal af", week 1 "merkgegevens stromen binnen").
Per stap: wat, waar, hoe gemeten, wat het NIET doet. Schat uren. Benoem risico's op de
acceptatietest en op de OCR/tekstroute-koppeling.
