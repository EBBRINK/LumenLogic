# Goal: elk feit telt precies één keer

> Fase 2 (plan), 21 jul 2026. Synthese van twee plan-agents die vanuit verschillende hoeken
> spardden (behoudend/minimale-blast-radius vs. principieel/juiste-model). Probleem:
> `docs/probleem-wattage-dubbeltelling.md`. Basismeting hieronder is vastgelegd vóór de bouw.

## Waar de agents het over eens waren (en dat draagt het plan)

1. **Alleen in `weightedMatch`, alleen in de tak `specScore != null`.** Die expressie wordt
   nergens anders gebruikt: de spec-loze route sorteert op `matchCount`, een aparte expressie.
   Daardoor is de spec-loze query per constructie byte-identiek en blijven `inv2`/`inv7b` (die
   met `specs: {}` draaien) groen **zonder dat daar iets voor nodig is**. De `WHERE`/`conditions`
   blijven op álle tokens: recall identiek, besluit 4 ongemoeid. Gat A en gat B zitten ná
   `fetchCandidates` en worden niet geraakt.
2. **Onderdrukken is NULL-conditioneel per kandidaat.** `specScore` is NULL-neutraal: waar de
   productkolom leeg is oordeelt hij niet, en dán is het tekst-token het enige bewijs dat er is.
   Dus: kolom gevuld → `specScore` oordeelt, tekst-token zwijgt; kolom NULL → token telt gewoon.
   Geen dubbeltelling én geen weggegooid signaal. Dit is wat de ingreep klein houdt.
3. **`SPEC_COEFF` verhogen is de verkeerde route.** De bias is positie-afhankelijk
   (`tokenWeight(i)`), de correctie zou constant zijn: om een spec-token op positie *i* te
   overstemmen is `α > 2/(1+i/2)` nodig — 0,25 bij positie 14, maar 1,0 bij positie 2. Er
   bestáát dus geen constante α die de dubbeltelling opheft; hij verplaatst hem alleen. En het
   is al empirisch gesneuveld: `α = 0,30` duwde anker Lw001 van rang 1 naar 3
   (`docs/goal-tekstrelevantie.md`).
4. **Opus 4.8 bouwt fase 3.** Niet om de diff (~80 regels), maar om meetlat-punt 4: elke
   statuswijziging elders per regel verantwoorden als verbetering óf regressie. Dat is
   semantisch oordeelswerk, en precies daar is dit dossier eerder onderuit gegaan.

## Waar ze verschilden — en de beslissende verificatie

Agent 1 wilde een eigen, per-veld unit-whitelist in `textscore.ts` (`27W` wel, `L90` niet).
Agent 2 wilde de **bestaande parser** als enige waarheid gebruiken.

Agent 2 wint, op een feit dat ik zelf heb nagetrokken:
`lib/pdf/armaturenboek.ts:131` doet `const specs = type ? parseProductName(type) : {}`, waarna
`type` als `productText` op de regel landt. **De `req_*`-velden zijn dus geparsed uit exact de
tekst die de tekstscore tokeniseert.** De vraag "welke karakters hebben deze gevraagde waarde
voortgebracht" is daarmee al beantwoord door `parseProductName` — een tweede detectieheuristiek
zou daarvan kunnen afwijken, en dan heb je twee waarheden over hetzelfde feit.

Die parser is bovendien al eenheids-verankerd en conservatief: `parseWatt` eist `W/Watt`,
`parseKelvin` eist `K`, `parseLumen` eist `lm/lumen` (met in de comment expliciet: de kale
"1500" in "SUSP 1500" wordt bewust NIET als lumen gelezen), `parseCri` eist het label `CRI|Ra`,
`parseBeamAngle` eist `°|deg|graden`. **`L90` matcht `parseCri` niet** (geen label) → wordt niet
onderdrukt. De valse positief uit het probleemdoc lost zichzelf op.

## Het model

Niet "tekst = type, spec = getallen" — die grens houdt geen stand (`STRETTA 600`, `SUSP 1500`
zijn én type én maat). De grens is **herkomst**:

> **Een stuk tekst waaruit wíj een `req_*`-veld hebben afgeleid, is overgedragen aan `specScore`;
> de tekstscore mag het niet nog eens ruw herbeoordelen. Alles waar geen `req_*`-veld op steunt —
> inclusief kale getallen als `100`, `600`, `1500` — blijft volledig tekst, mét positiegewicht.**

Zelf-corrigerend: leest de parser iets verkeerd, dan is dat één fout op één plek, niet twee die
elkaar versterken. En `100` in `SASSO PRO 100` blijft onaangeraakt op gewicht 0,50, want er is
geen gevraagd veld met waarde 100 — precies de valkuil die het plan moest overleven.

## Aanpak

1. **`lib/enrichment/parser.ts`**: de veld-regexes naar benoemde constanten tillen en één nieuwe
   export toevoegen die dezelfde patronen globaal draait en **spans** teruggeeft
   (`{field, start, end}`). `parseProductName` houdt byte-identiek gedrag (hij draait op 31k
   productnamen in de verrijking) — puur een refactor naar één regexset, geen tweede.
2. **`lib/matching/textscore.ts`**: tokeniseren mét karakterposities, in exact dezelfde volgorde
   en met exact dezelfde `filter(t => t.length >= 2)` **vóór** het indexeren — de index bepaalt
   `tokenWeight(i)`, dus die mag niet verschuiven.
3. **`lib/matching/engine.ts`, `fetchCandidates`**: een token waarvan de span overlapt met een
   spec-span van een **gevraagd** veld krijgt een NULL-conditionele term in plaats van een
   constante: `case when <kolom> is null and name ilike '%27%' then 0.125 else 0 end`. Overlapt
   een token meerdere velden, dan telt hij alleen mee als **álle** betrokken kolommen NULL zijn.
4. **Index-guard: posities 0 en 1 worden nooit onderdrukt.** Agent 1's verzekering tegen de
   valkuil, en er is een concreet geval: Bega's `24786W` (Lr304) wordt door `parseWatt` als
   24786 watt gelezen terwijl het een typenummer is. `splitBrandType` snijdt het merk eraf, dus
   de typeaanduiding staat vooraan; alle zes spec-tokens van Lr301/Lr303 staan op positie ≥9.
   Kosten voor de acceptatie: nul.
5. **Meetinstrument**: `scripts/eval-testset.ts` krijgt één read-only veld `top1Code` in
   `RegelResultaat`. Vandaag draagt `top1` alleen een boolean tegen de grondwaarheid; om
   meetlat-punt 4 ("verbetering of regressie?") op ongemapte regels in te vullen is de
   identiteit van de gekozen kandidaat nodig. Wijziging in het meetinstrument, niet in de engine.

**Geen lege sommen:** elk token houdt een `CASE`-term (soms met extra NULL-conditie), dus de
`sql.join` wordt nooit leeg en de `ORDER BY 0`-valkuil blijft buiten bereik.

## Basismeting (vastgelegd vóór de bouw, echte codepad)

```
raadhuis   31/31   open:13 blauw:10 geel:5 rood:2 paars:1   rang≤50 4/4   auto 0/4   top-1 1/4
kvk         0/48   –
tno        15/20   open:11 blauw:2 groen:1 geel:1
dordrecht   0/18   –
```

## Meetlat

1. **Lr301 en Lr303 geven een verschillende top-1** — de acceptatie.
2. Lr301 blijft op rang 1; raadhuis `rang≤50` blijft 4/4.
3. tno blijft `groen:1` (gat B niet ongedaan); kvk en dordrecht ongewijzigd.
4. Elke statuswijziging elders per regel verantwoord, niet weggemiddeld. De voorspelde
   ~11 omslagen zijn **niet betrouwbaar** (de replica mist tiebreaks, 9 van 13 misvoorspeld) —
   alleen de echte `eval-testset.ts` vóór/ná op dezelfde base telt.
5. `bun vitest run` volledig groen (nu 808), `bunx tsc --noEmit` schoon.
6. Nieuwe pure unit-tests (geen DB): `L90` bij `cri=90` → niet onderdrukt; `27W` bij `watt=27` →
   wel; `100` bij `watt=null` → nooit; token op index 0/1 → nooit; `parseProductName` blijft
   byte-identiek.

## Risico's die fase 3 expliciet moet meten

- **De NULL-conditie kan data-loze producten belonen**: kandidaat A (kolom gevuld) verliest zijn
  tekstpunt, B (kolom NULL) houdt het. Bij een top-1-wissel naar een rij met NULL-kolom is dat
  een regressie-kandidaat, geen verbetering. Per wissel controleren.
- **Bare-getal-collisie**: `req_cri = 90` maakt elk `90` in elke naam verdacht. De index-guard
  dekt alleen 0-1; posities 2-5 dragen nog 0,50-0,33. Vóór de run uitdraaien welke tokens
  onderdrukt worden mét index en gewicht, en alles met index ≤5 met de hand nalopen.
- **`dimmable`/`DALI` is het grensgeval**: sterk familie-token én geparsed veld. De NULL-conditie
  redt het waar de kolom leeg is; waar hij gevuld is verdwijnt het. Meten of dat elders bijt.
