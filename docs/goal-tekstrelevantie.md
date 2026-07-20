# Goal: de tekstrelevantie-term repareren

> Synthese van twee plan-agents (20 jul 2026), beide gemeten via het echte codepad.
> Vervangt stap 3, 4 en 5 van `docs/goal-variant-ranking.md`. Probleem:
> `docs/probleem-tekstrelevantie.md`.

## ✅ Gebouwd (20 jul) — de tekstrelevantie-term

Agent 2's basis, met de poort-beslissing en agent 1's vangnetten. In `lib/matching/engine.ts`
(`fetchCandidates`) + nieuw `lib/matching/textscore.ts`. De `list`-toekenning en `judgeCandidate`
onaangeraakt; geen prijs; `WHERE`/recall byte-identiek.

- **Positiegewogen tekstscore** (`tokenWeight(i) = 1/(1+i/2)`): token 0 (de typeaanduiding, want
  het merk is al afgesneden) weegt 1,0, de spec-proza-staart licht. Dit repareert de PRIMAIRE
  sleutel — de kern die een tiebreak niet kon.
- **Gecombineerde sleutel** `weightedMatch + 0,15·specScore`, met `specScore` NULL-neutraal en
  spiegelend aan de tolerantie-oordelen (groen +1 / geel +0,5 / rood −1 / leeg 0). Daarna een
  continue watt-afstand-tiebreak (NULL achteraan).
- **Drievoudige poort**: alleen als de regel `brand.length > 0` **én** `hasAnyRequestedSpec` **én**
  tokens draagt. Zonder specs → byte-identiek aan vandaag (inv2/inv7b-garantie, besluit Timo).
  Zonder merk → óók terug naar vandaag: gemeten anders trok de spec-score op een merkloze
  placeholder (Ls002, "Te bepalen door meubelmaker") een outdoor-light als GROEN omhoog — een
  regressie die tijdens het bouwen is gevonden en met de merk-poort gedicht.
- **Totale orde** al gedekt door de sluittermen `asc(articleCode), asc(id)` (commit `53608de`).

**Gemeten resultaat (echt codepad, 3 identieke runs, stabiel):**

| regel | VOOR | NA | eq-klasse |
|---|---|---|---|
| Lr301 → `…2413537F` | 2676 | **3** | 3 |
| Lr303 → `…2412537W` | 2023 | **7** | 7 |
| Lw001 / Lw002 (ankers) | eq 1 | eq 1 | **1** (ongewijzigd) |

**Eerlijk over wat er NIET gehaald is** — en het is één oorzaak: `beam_angle` is leeg in de
catalogus, dus Lr301 (FL/39°) en Lr303 (WF/57°) krijgen **dezelfde top-1** (`SASSO PRO 100 ME
ADJ DALI 27W`). Het meetlat-criterium "verschillende topkandidaten" en "eq-klasse op 1–2" is dus
**niet** gehaald door deze stap alleen — die hangt aan de optiekcode→beam-verrijking (hieronder),
precies zoals voorspeld. Wat wél binnen is: de juiste familie staat nu bovenaan in plaats van op
rang 2676, en dat is de voorwaarde waar al het andere op wachtte.

**Blast-radius geverifieerd** tegen main (stash-vergelijking): raadhuis wijzigt op precies één
regel — Lr301 geel→open, en dat is eerlijker (de juiste familie staat er nu, met onbekende
cri/ip/lumen/beam → `provable` blijft leeg zoals beloofd, geen valse tolerantie-match meer op een
verkeerd product). tno, kvk en dordrecht **byte-identiek** aan main. `bun vitest run` 754 groen,
`tsc` schoon.

**Direct volgende stap (afgesproken): de optiekcode→beam-verrijking**, zodat FL/WF gaan scheiden.
Gecureerde tabel (`FL`→39, `WF`→57, `ME`→25, `SP`→15) door de verrijkingspoort met bron
`'optic-code'` en eigen `tier2_source`-label — NIET hardgecodeerd in de matcher. De beam-term in
`specScore` is al bedraad en NULL-neutraal; zodra de kolom gevuld is, gaat hij vanzelf meewegen.

## Waar beide agents onafhankelijk op uitkwamen

**1. De primaire sleutel moet gerepareerd, een tiebreak kan het niet.** Agent 2 formuleert het
scherpst: bij Lr303 verliest het juiste artikel de tekstsleutel met **0,125** (het token `27`
matcht wel `27W`, niet `26,5W`) terwijl het op specs +2 vóórligt. Een strikte primaire sleutel
kan dat per definitie niet inhalen — een tiebreak dus ook niet, op geen enkele epsilon. Dat is
exact waarom stap 3 sneuvelde, en het bevestigt de intrekking in `dc961fd`.

**2. De vroege tokens zíjn de typeaanduiding.** `splitBrandType` snijdt het merk eraf, dus
positie 0–2 van `productText` is wat het armatuur identificeert; alles daarna is spec-proza en
opmerking. Beide voorstellen zijn dezelfde gedachte in twee hardheden — agent 1 knipt een
harde kop af, agent 2 laat het gewicht continu aflopen.

**3. De optiekcode `FL`/`WF` is onmisbaar.** Lr301 en Lr303 verschillen in **niets** behalve de
optiek. Beide agents halen zonder die term de meetlat niet, en beide melden dat de tabel
(`FL`→39°, `WF`→57°, `ME`→25°, `SP`→15°) **handwerk is en niet uit de catalogus af te leiden**:
`beam_angle` is op 4% van de XAL-rijen gevuld en de enige groepen die er zijn spreken zichzelf
tegen (`ME` én `SP` staan allebei op 30°). Dit is de zwakste schakel van het geheel.

**4. ⚠️ De huidige ordening is geen totale orde — en dat besmet elke meting in dit dossier.**
Beide agents liepen erin. `asc(name)` is de laatste sorteerterm en namen zijn niet uniek (drie
`STRETTA 600 …`-rijen zijn byte-identiek van naam), dus Postgres mag binnen een gelijke sleutel
doen wat het queryplan uitkomt. Gemeten: Lw001 gaf over drie identieke runs rang **1, 1, 3**.
**Elke rang op exacte artikelcode draagt ±2 ruis; alleen de equivalentieklasse is stabiel.**
Dat is toevallig precies de meetlat die het goal-doc al koos — maar om de goede reden pas nu.
Los op met `asc(articleCode)` als sluitterm: deterministisch, prijs-blind.

## De twee voorstellen, gemeten

Rang van Jayden's artikel binnen de XAL-kandidatenset, echte geparste `productText`.

| regel | VOOR | agent 1 (typeHead) | agent 1 + optiek | agent 2 (positie + spec) |
|---|---|---|---|---|
| Lr301 → `…2413537F` | 2675 | 4 | **1** | **eq-klasse 1** |
| Lr303 → `…2412537W` | 2023 | 16 | **3** | **eq-klasse 1** |
| Lw001 (anker) | eq 1 | eq 1 | eq 1 | eq 1 |
| Lw002 (anker) | eq 1 | eq 1 | eq 1 | eq 1 |

De ankers verslechteren in geen enkele variant. Agent 2 haalt bovendien het échte
meetlat-criterium: **Lr301 en Lr303 leveren verschillende topkandidaten** —
`SASSO PRO 100 **FL** ADJ DALI 27W` tegen `SASSO PRO 100 **WF** ADJ DALI 26,5W`. Vandaag zijn
die twee regels voor de engine praktisch niet te onderscheiden.

## Eerlijke negatieven — gemeten, niet beredeneerd

- **Spec-tokens lager wegen** (`3000K`, `27`, `104` downwegen) maakt het **slechter**: Lr301
  2675 → 9129, Lr303 2023 → 3069. En het kán niet werken: downwegen maakt het verschil kleiner,
  nooit nul, en een strikte primaire sleutel breekt op elke epsilon.
- **Woordgrens-matching** (`%100%` matcht nu ook "1008" en "1171") wérkt qua rang — Lr301 2675
  → 40 — maar kost **10× looptijd** (4,5 s → 46 s bij 121 tokens; ook met genormaliseerde naam
  en afgeleide tabel bleef het 54 s, want Postgres vlakt de subquery af). Onbruikbaar zoals het
  is. Het onderliggende probleem blijft echter reëel en onopgelost.
- **`typeHead` alléén** scheidt Lr301 en Lr303 niet: beide leveren dezelfde top. Het repareert
  de primaire sleutel, waarna de eerder kansloze tiebreaks ineens wél bijten (4 → 1, 16 → 3).
- **`beam_angle` als kolom is onbruikbaar** voor dit doel: 1.295 van 31.420 XAL-rijen gevuld.

## Wat nog niet gemeten is — poort vóór merge

Beide voorstellen zijn afgeregeld op **vier regels uit één PDF**. Agent 2's coëfficiënten
(decay `i/2`, `α = 0,15`) zijn gevoelig: `α = 0,05` gaf Lr303 rang 9, `α = 0,30` gaf Lw001 rang
3. Agent 1's kop-detectie faalt zichtbaar op Lr304 (Bega, regel begint met `24786W` →
`parseProductName` ziet 24786 watt → kop leeg) en levert bij Lp202/Lp203 het zwakke `["50","823"]`.

**Verplicht vóór merge:** `scripts/eval-testset.ts` over de héle testset (raadhuis + kvk + tno),
met als eis dat de andere 27 raadhuis-regels en de kvk/tno-kandidatenlijsten ongewijzigd of
beter zijn. Een winst op vier regels die de andere 42 sloopt is geen winst.

## Openstaand besluit — expliciet, want het raakt een vangrail

De randvoorwaarde luidt: *"zonder gevraagde specs moet de query byte-identiek aan vandaag
blijven"* — dat is de garantie waarmee `inv2`/`inv7b` overeind blijven (die draaien met
`specs: {}`).

Agent 1 meldt dat zijn poort die randvoorwaarde **schendt**: hij poort op *kop-aanwezigheid*,
niet op *spec-aanwezigheid*, dus met `specs: {}` en een niet-lege kop verandert de query wel
degelijk. Hij beredeneert dat `inv2`/`inv7b` toevallig groen blijven (beide geseede producten
bevatten beide kop-tokens, dus de term is constant) maar heeft dat **niet gemeten**, en weigert
expliciet de randvoorwaarde op eigen gezag te herinterpreteren. Terecht.

Agent 2 poort wél op `hasAnyRequestedSpec` en voldoet dus letterlijk aan de randvoorwaarde.

**Besluit Timo (20 jul): de randvoorwaarde blijft letterlijk.** De poort staat op
`hasAnyRequestedSpec`, zoals agent 2. Gevolg, bewust aanvaard: een regel **zonder** gevraagde
specs krijgt geen tekstrelevantie-verbetering en blijft ranken zoals vandaag. De garantie onder
`inv2`/`inv7b` blijft daarmee ongewijzigd van kracht en hoeft niet geherformuleerd te worden —
een vangrail herschrijven om een meting te laten slagen is precies wat dit dossier al twee keer
de verkeerde kant op heeft gestuurd. Agent 1's kop-poort is hiermee afgekeurd in zijn huidige
vorm.

## Aanbeveling

**Agent 2's aanpak als basis** — hij haalt de meetlat op alle vier de regels, hij voldoet
letterlijk aan de spec-poort-randvoorwaarde, hij heeft geen harde grens-detectie die stil kan
falen (agent 1's kop wordt leeg bij Lr304 en dan is er niets), en de performance-impact is
gemeten en verwaarloosbaar (+6% op de langste regel, geen nieuwe regex/window/subquery).

**Met twee dingen uit agent 1 erbij:** de `asc(articleCode)`-sluitterm voor een totale orde
(los van welke aanpak wint — dit is een bug-fix), en zijn poort `brandText != null` als
vangnet, want 17 van de 31 raadhuis-regels hebben geen merk en zonder merkfilter herordent een
losse kop de héle catalogus (agent 1 mat één echte valse positief: Ls004 → kop `["EHBO"]`).

**Los besluit, niet meeliften:** de optiekcode-tabel is gecureerde data, geen afgeleide. Hij
hoort als bron `'optic-code'` met eigen `tier2_source`-label door de verrijkingspoort, precies
zoals stap 5 van het oude goal-doc al voorschreef — niet hardgecodeerd in de matcher.
