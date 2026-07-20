# Goal: de juiste variant komt bovenaan

> **Fase 2 af — klaar om uit te voeren, nog niet uitgevoerd.** Opgesteld 20 jul 2026 door de
> sprintmaster na fase 1 (`docs/probleem-variant-ranking.md`, **inclusief de correctie onderaan
> dat document — lees die eerst**) en twee plan-agents die vanuit verschillende hoeken sparden.
> Dit document is de synthese; werk 'm stap voor stap af.

## De kern, in één alinea

Dit is **geen ranking-probleem met een data-bijsmaak, maar een dataprobleem met een
ranking-symptoom.** Waar het onderscheidende signaal in een gevulde kolom zit (`max_wattage`
bij Lw001/Lw002: 13 vs 19,5 W) werkt de ranking al — die twee staan op **rang 3**. Waar het
alleen als tekst in de naam staat (XAL's optiekcode `FL`/`WF` voor Lr301/Lr303, `beam_angle`
**0 van 131** gevuld) faalt hij volledig: bij `limit=300` staat Jayden's artikel er nog steeds
niet in.

De grootste hefboom is daarom geen algoritme maar **een knop die al bestaat en nooit is
ingedrukt**: de verrijkingspijplijn (`lib/repo/enrichment.ts`, UI op `/data/enrichment`) is
compleet gebouwd, heeft 3 runs, en **0 producten met `tier2_source`**.

## De meetlat — expliciet herzien

**"Top-1 == Jayden's exacte artikelcode" is een foute KPI en wordt niet gebruikt.**
`L360048-2413537F` en `…38F` hebben identieke naam, kelvin, wattage én prijs (€349); `color_1`
is leeg. Jayden koos 37F, maar 38F was even goed — de regelset zegt zelf dat Brink bij gelijke
prijs cosmetische varianten zelf mag kiezen.

**De lat is: staat de equivalentieklasse (naam + prijs identiek) op rang 1–2.**

**En wees eerlijk over wat er níét komt:** `provable` blijft **leeg** voor alle vier de regels,
ook na de volledige fix — Lr301 vraagt lumen 2810 en beam 39°, die blijven onbekend. Er komt
hier geen groen uit. Wat verbetert is de rang en het aantal onbekende velden per kandidaat.

## Stappen

**Stap 0 — herijken (0,5 u).** Draai `scripts/eval-testset.ts --case=raadhuis --rank-limit=50`
(en één keer `--rank-limit=300`), leg de vier rangen + `provable`-lengte vast als nulpunt.
*Doet NIET:* code aanraken, de `--assert-nulmeting` bijstellen.

**Stap 1 — verrijkingsrun voor XAL (2–3 u, nauwelijks nieuwe code).** ⚠️ **Eerst de
steekproefpoort repareren.** `inSampleAt(i) = i % 3 === 0` levert bij ~13.400 items ~4.500
reviewrijen; ongereviewde items publiceren gewoon mee (alleen expliciet `'fout'` blokkeert).
Dat is een menselijke poort die alleen op papier bestaat — erger dan geen poort, want hij wekt
vertrouwen dat er niet is. Maak er eerst een begrensde, gestratificeerde steekproef van
(bv. 100 items verdeeld over distinct naamvormen, ~1 u). **Dán** pas: `/data/enrichment` → XAL
→ steekproef → publiceren; `publishRun` hermatcht zelf.
*Meet:* CRI gevuld op ≥11.000 XAL-producten (geverifieerd: 11.379 hebben CRI in de naam en een
lege kolom); Lw001/Lw002 verliezen elk twee `onbekend`-deviations; de vier rangen mogen niet
verslechteren.
*Doet NIET:* de parser uitbreiden, bestaande waarden overschrijven (`fieldIsEmpty` bewaakt dat),
andere merken draaien.

**Stap 2 — producttekst-hygiëne (2–3 u).** `lib/pdf/armaturenboek.ts`, `parseTocText`. Lr301's
`productText` is ~90 tokens inclusief de complete paginakop ("Blad 1 van 4 · Referentie Locatie
Montagewijze Vorm Fabricaat …"); Lr303's is schoon. Het record loopt door tot de volgende
CODE-token en slurpt de paginarand op. Begrens de recordlengte en/of knip op de bekende
kolomkop-markers.
*Meet:* Lr301 `productText` < 25 tokens. **`--assert-nulmeting` breekt hier by design** —
herijken in dezelfde commit, mét motivering.
*Doet NIET:* de segmentatie herontwerpen, de AI-leesroute raken.

**Stap 3 — spec-bewuste ordening (3–4 u).** `lib/matching/engine.ts`, `fetchCandidates`,
**uitsluitend** de `orderTerms`. Ontwerpkeuze uit de plan-fase: **specScore is een tiebreak, geen
gewogen som** — anders kan een product dat één zwak token deelt maar toevallig 3000K is boven de
echte SASSO uitkomen. De volgorde wordt:
`tekstrelevantie → specScore → prefixBonus → similarity → naam`.
Termen elk NULL-neutraal (`req is null OR kolom is null → 0`): kelvin exact +3 / anders −3;
watt binnen 10% +2, binnen 40% +1, daarbuiten −2; beam ≤10° +2, ≤25° +1, daarbuiten −2;
IP ≥ gevraagd +1, lager −3; lumen binnen 15% +1, daarbuiten −1. **CRI krijgt géén term** zolang
de kolom leeg is (dode SQL is oneerlijker dan hem weglaten) — herzien ná stap 1.
Guard: is er geen enkele gevraagde spec, dan is de query **byte-identiek aan vandaag** —
dat is de garantie waarmee `inv2`/`inv7b` overeind blijven (die draaien met `specs: {}`).
Let op de `ORDER BY 0`-valkuil die eerder een crash gaf.
*Meet:* Lr301 en Lr303 in de top-10 (SQL-simulatie van de plan-agent zegt rang 7 met alleen
kelvin+watt); Lw001/Lw002 blijven ≤3; `provable` blijft leeg; nieuwe test **"spec-boost
verplaatst nooit een kandidaat van lijst 2 naar lijst 1"**.
*Doet NIET:* de `list`-toekenning (`engine.ts:460-461`) of `judgeCandidate` raken, filteren,
iets in de `WHERE` zetten, een prijsterm toevoegen.

**Stap 4 — tokenselectiviteit (2–3 u).** `WALL` komt **16.959×** voor, `STRETTA` **36×** — en
`matchCount` weegt ze gelijk. Bovendien matcht `%100%` op "1008" en "1171". Woordgrens-matching
plus een zeldzaamheidsgewicht (`1 / ln(1 + df)`, df over de kandidatenset zelf, via één CTE met
window-functie — geen extra roundtrip, geen precompute).
*Meet:* **op KvK/TNO**, want Raadhuis is hier al genezen. Regressie-eis: Raadhuis-rangen
onveranderd; acceptatietest groen **zonder verwachtingen bij te stellen** — schuift er een
verwachting, dan is dat een stopmoment, geen update.
*Doet NIET:* tsvector/`ts_rank`, embeddings, stopwoordenlijsten, synoniemen.

**Stap 5 — optiekcode → beam angle voor XAL (2–3 u).** Gecureerde tabel (`FL`→39, `WF`→57,
`ME`→25, `SP`→15) als bron `'optic-code'` binnen dezelfde verrijkingspoort, met eigen
`tier2_source`-label zodat de herkomst zichtbaar blijft. Stopgap: laat de waarden bevestigen via
het net gebouwde 1.2-retourpad.
*Meet:* Lr301 en Lr303 op rang 1–2 (equivalentieklasse), en — **de enige echte test** — Lr301 en
Lr303 leveren **verschillende** topkandidaten op. Vandaag zijn die twee regels voor de engine
identiek.
*Doet NIET:* andere merken, een generieke optiek-ontologie, ETIM.

**Stap 6 — equivalentieklassen tonen (3–4 u, optioneel).** `37F`/`38F` als één rij met een
afwerkingskeuze in plaats van twee die om rang 1 vechten. Sluit aan op `lib/repo/variants.ts`.
Dit is waar het systeem hoort te zeggen: *hier houdt de data op, hier kiest de mens.*
*Doet NIET:* automatisch kiezen; `pickUnambiguousYellow` blijft ongemoeid.

**Totaal 15–21 u. Stap 0–1 is >50% van de winst in <20% van de tijd.**

## Wat expliciet géén goed idee is (uit beide plannen)

1. **Hard filteren op specs in de `WHERE`** — vaagt de catalogus weg (CRI 0 gevuld) en schendt
   besluit 4 frontaal. Ook niet met een `OR NULL`-tak: dat laat 67% staan, filtert dus vrijwel
   niets, maar introduceert wél een constructie die bij het volgende veld vergeten wordt.
2. **"Matcht op kelvin" genoeg maken voor lijst 1** — breekt `872597b`. Dit is de verleiding die
   de metriek mooi maakt en het product waardeloos.
3. **Embeddings of vectorzoeken** — dit zijn codes, geen proza. Vier `case`-expressies zetten het
   juiste artikel op rang 1; vectoren voegen infra, latency en on-uitlegbaarheid toe aan een
   matcher die aan Eduard uitgelegd moet kunnen worden.
4. **LLM in de kandidatenstap** — de modulekop verbiedt het expliciet. Niet stilletjes oprekken.
5. **Merkbrede spec-aannames** ("XAL is altijd CRI90") — dat is specs verzinnen.
6. **De limiet verhogen als "de fix"** — gemeten: bij 300 zit het artikel er nog steeds niet in.
7. **De tolerantietabel oprekken** (2700K als geel accepteren) — dat is de meetlat verbuigen tot
   de meting slaagt.
8. **Publiceren in stap 1 zonder de steekproef eerst hanteerbaar te maken.**

## Vangrails

IJzeren regels 1–5 onaangetast, m.n. **regel 2** (geen prijs in enige sorteersleutel;
`inv2`/`inv7b` groen) en **regel 3** (kandidaten alleen uit `visible_products`). **Besluit 4**:
geen-data is neutraal — nooit uitgesloten, alleen niet gepromoveerd. **"Groen is groen"**
(`872597b`): de `list`-toekenning wordt niet aangeraakt; de ranking bepaalt *wie* beoordeeld
wordt, nooit *hoe*. Statussen-semantiek uit `docs/matching-regelset.md` wordt niet
geherdefinieerd. Acceptatietest blijft het regressie-anker. Testset in
`~/Downloads/lumenlogic-testset/` nooit in git.

**Eén bewuste verschuiving die als besluit moet worden vastgelegd:** de volgorde *binnen lijst 2*
verandert van ruwe fetch-volgorde naar "meest aantoonbaar juist, minst onbekend, bovenaan". Dat
is presentatie, geen semantiek — mét de regel dat *minder onbekend* nooit *onbekend telt als
geslaagd* wordt.

## Modeladvies (beide plan-agents, onafhankelijk tot hetzelfde gekomen)

- **Sonnet 5** voor stap 1, 3 en 4: scherp omschreven, numeriek meetbaar, ontwerpruimte ≈ 0.
- **Fable 5** voor stap 0, 2, 5 en 6: daar breekt de nulmeting-assertie by design (stap 2), en
  daar ligt de grens tussen "wat het systeem mag afleiden" en "wat de mens kiest" (stap 5–6).
- **Moet het één model zijn: Fable 5.** De twee stappen met het hoogste risico op onherstelbare
  schade — de statussemantiek stilzwijgend verschuiven, en de menselijke poort in de verrijking
  tot theater reduceren — zijn allebei semantisch, niet technisch. Beide zien er in een diff
  volstrekt onschuldig uit.

## Werkwijze

Per stap: probleem kort uitschrijven → plannen met 2 agents waar het echt bouwwerk is → bouwen.
`bun vitest run` groen · `bunx tsc --noEmit` schoon · meetscript draaien en het delta rapporteren
· kleine commit + push · `HANDOVER.md` bij. **Push = productie hier: akkoord vragen vóór de push.**
Er draaien parallelle sessies — altijd eerst `git fetch origin`.
