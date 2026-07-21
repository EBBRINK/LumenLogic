# Probleem: de wattage telt twee keer mee

> Fase 1 (probleem uitschrijven), 21 jul 2026. Alle cijfers hieronder zijn gemeten via het
> ECHTE codepad — `parseSpecLinesFromPages` → `evaluateSpecLine`, exact zoals
> `scripts/eval-testset.ts` — nooit via een nagebouwde SQL-query of een hardgecodeerde
> productnaam. Dat is de les uit `docs/probleem-variant-ranking.md` ("de vijfde keer deze week
> dat een eigen meting sneuvelde op een handmatige reproductie").
> Voorgangers: `docs/goal-tekstrelevantie.md` (rang gerepareerd), gat B (herkomst-poort).

## De meetlat die nog niet gehaald is

`docs/goal-variant-ranking.md` stelt één echte test: **Lr301 (39°) en Lr303 (57°) verschillen in
niets behalve de optiek, dus ze horen een verschillende top-1 te geven.** Ze geven allebei
`L360048-2413537F`. Al het andere van dat spoor is af: Lr301 staat op rang 1, raadhuis
`rang≤50` is 4/4, tno staat op `groen:1`, en de optiekcode-verrijking (FL→39/WF→57) staat live
op 3.989 XAL-producten.

## De decompositie — bevestigd, exact

De briefing-cijfers kloppen tot op de vierde decimaal. Gemeten op Lr303 (gevraagd: 3000K,
CRI≥90, IP20, 27 W, 2810 lm, **57°**, DALI):

| kandidaat | tekstscore | specScore | gecombineerd |
|---|---|---|---|
| `L360048-2413537F` **FL** (39°, 27 W) | **2,5644** | 3,50 | **3,0894** ← top-1 |
| `L360048-2413538F` FL (identiek) | 2,5644 | 3,50 | 3,0894 |
| `L360048-2412537W` **WF** (57°, 26,5 W) | 2,4394 | **4,00** | 3,0394 |

- Tekstverschil **0,1250** — en dat is *exact* één token: `"27"` op positie 14, gewicht
  `1/(1+14/2) = 0,125`. De FL-naam draagt `27W`, de WF-naam `26,5W`; alle andere tokens matchen
  op allebei of op geen van beide.
- Specverschil **0,50** in het voordeel van WF (beam exact 57 → groen +1; FL 39° is 18° mis →
  binnen 25 → geel +0,5), maal `SPEC_COEFF 0,15` = **0,0750**.
- Netto: FL staat **0,0500** vóór. De ruwe tekstmatch verslaat de tolerante spec-match.

**Dat token `"27"` ís de wattage.** `specScore` beoordeelt watt al mét tolerantie — FL 27 W
exact (groen), WF 26,5 W binnen 10 % (óók groen) — en concludeert terecht dat ze gelijkwaardig
zijn. De tekstscore doet het dunnetjes over met een botte substring-match die 26,5 ≠ 27 wél
afstraft. Hetzelfde getal telt dus twee keer, en de slechtste van de twee metingen wint.

## Het geldt NIET alleen voor de wattage

Gemeten per regel welke producttekst-tokens numeriek gelijk zijn aan een gevraagde spec-waarde.
Lr301 en Lr303 dragen er elk **zes**:

```
Lr301: "2810"@10 (lumen)  "27"@14 (watt)  "(39°)"@20 (beam)
       "3000K"@21 (kelvin)  "90"@23 (cri)  "L90"@25 (cri)
Lr303: "2810"@10 (lumen)  "27"@14 (watt)  "(57°)"@19 (beam)
       "3000K"@20 (kelvin)  "90"@22 (cri)  "L90"@24 (cri)
```

Elk spec-veld waarvan de waarde als los token in de naam kan staan heeft dezelfde
dubbeltelling: kelvin (`3000K`), lumen (`2810`), CRI (`90`), beam (`39°`) en watt (`27`). Dat
de wattage hier de doorslag geeft is toeval van de data: het is bij Lr301/Lr303 het **enige**
spec-token waarop de FL- en WF-naam verschillen.

⚠️ **En de detectie overreikt.** Twee van die zes zijn valse positieven: `L90` is de
levensduurklasse (90 % lichtbehoud), niet CRI; en elders wordt `25°C` (omgevingstemperatuur)
als beam=25 gelezen. Een naïeve "is dit getal gelijk aan een gevraagde waarde"-regel pakt dus
tokens die niets met die spec te maken hebben. Voor de fix is dat grotendeels ongevaarlijk (het
zijn generieke tokens die in vrijwel elke naam voorkomen), maar het is wél het bewijs dat
getal-gelijkheid alléén een te grove regel is.

## De valkuil, met cijfers

**Niet alle cijfertokens uitsluiten.** `"100"` in `SASSO PRO 100` staat op positie 2 met gewicht
**0,50** — vier keer zwaarder dan de `"27"` die weg moet — en is juist type-identificerend: het
is precies wat de SASSO-familie boven de generieke `INS`-producten houdt (zie
`docs/goal-tekstrelevantie.md`, waar dat de kern van de rangfix was). `100` is géén gevraagde
spec-waarde (er is geen `req_*`-veld met waarde 100), dus het onderscheid is niet "is het een
getal" maar **"beoordeelt `specScore` dit veld al voor deze regel"**.

## Wat de fix zou doen (voorspeld, nog niet gebouwd)

Met de spec-waarde-tokens uit de tekstscore geweerd, voorspelt de gevalideerde replica:

- **Lr301 → `L360048-2413537F` (FL), ongewijzigd.** Beam 39 exact → +1; WF 57 is 18° mis → +0,5.
- **Lr303 → `L360048-2412537W` (WF), KANTELT.** Beam 57 exact → +1; FL 39 is 18° mis → +0,5.

Dat is precies de acceptatie: **verschillende top-1**. Het mechanisme klopt ook conceptueel —
de tekstscores van beide regels worden identiek (hun producttekst verschilt alleen in het
beam-getal), waarna de beslissing verschuift naar `specScore`, waar de beam sinds de
optiekcode-verrijking eindelijk gevuld is. De onderscheiding verhuist van botte
substring-matching naar de tolerante spec-vergelijking. Dat is waar hij hoort.

## Hoe breed is de schade — en wat ik NIET kan hardmaken

Over de drie cases mét tekstlaag (raadhuis 31 regels, tno 15, kvk 0 gelezen):

| | |
|---|---|
| regels met producttekst | **46** |
| regels met ≥1 spec-waarde-token | **43** (93 %) |
| regels waar de replica een andere top-1 voorspelt | 11 |

**Dat laatste getal is niet betrouwbaar en ik presenteer het niet als bevinding.** De replica
modelleert de primaire sorteersleutel (tekstscore + `0,15·specScore`) en de watt-afstand, maar
níét de resterende tiebreaks (`prefixBonus`, `similarity`, `name`, `articleCode`, `id`). Bij de
13 geïnspecteerde regels voorspelde hij de echte volgorde 4× wél en 9× niet — en die 9 zijn
stuk voor stuk gevallen waar de topkandidaten **exact gelijk** scoren op de gecombineerde
sleutel (bv. Lf902: drie kandidaten alle drie op 1,0358, `provable=0 incomplete=14`, dus de
lijst-samenvoeging is niet de verklaring). Waar alles gelijk is, beslist een tiebreak die ik
niet nabouw.

Wat wél hard is: **voor de vier regels die de meetlat vormen (Lr301, Lr303, Lw001, Lw002)
voorspelt de replica de echte volgorde exact** ("JA ✓"), dus de decompositie hierboven staat.
De werkelijke blast radius is alleen te meten door de fix te bouwen en de echte
`eval-testset.ts` te draaien — niet te voorspellen. Dat is expliciet een taak voor fase 3, met
vóór/ná op dezelfde base.

## Vangrails die niet mogen sneuvelen

- **IJzeren regel 2**: geen geld in de ranking; `inv2`/`inv7b` groen.
- **IJzeren regel 3**: kandidaten uitsluitend uit `visible_products`.
- **Besluit 4**: geen-data = grijze vlag, nooit stil wegfilteren. De fix mag de `WHERE` niet
  raken — alleen de ordening. Recall blijft identiek.
- **Gat A** ("groen is groen", specloos → nooit lijst 1) en **gat B** (onbevestigde bron
  `optic-code` → nooit lijst 1) blijven staan; tno blijft `groen:1`.
- De positiegewogen tekstscore zelf blijft: `100` op positie 2 moet zijn gewicht 0,50 houden.

## Meetlat voor fase 3

1. **Lr301 en Lr303 geven een verschillende top-1** — de acceptatie.
2. Lr301 blijft op rang 1; raadhuis `rang≤50` blijft 4/4.
3. tno blijft `groen:1`; kvk en dordrecht ongewijzigd.
4. Elke statuswijziging elders wordt per regel verantwoord (verbetering of regressie), niet
   weggemiddeld — de blast radius is onbekend tot hij gemeten is.
5. `bun vitest run` volledig groen (nu 808), `bunx tsc --noEmit` schoon.
