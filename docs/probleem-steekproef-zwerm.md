# Probleem: de steekproef van 100 is een menselijke grens, geen inhoudelijke

> Fase 1 (probleem uitschrijven), 30 jul 2026. Volgt op `docs/probleem-lege-speckolommen-xal.md`
> en `docs/plan-lege-speckolommen-xal.md`. Alle cijfers zijn gemeten op de Neon-branch
> `enrichment-xal` via `scripts/meet-verdenking.ts`; de faalvormen zijn uitgeschreven als
> toetsbare regels in `lib/enrichment/verdenking.ts` (11 tests) in plaats van als vermoeden.

## Waarom dit moet veranderen

`SAMPLE_MAX = 100` staat er omdat een mens niet meer aankan. De code zegt het zelf: bij ~30 %
steekproef waren het er 4.500 voor XAL, "niemand controleert 4.500 rijen, dus de menselijke poort
werd in de praktijk doorgeklikt — erger dan geen poort, want hij wekt vertrouwen dat er niet is"
([enrichment.ts:57](lib/repo/enrichment.ts:57)).

Dat is een grens van de controleur, niet van de controle. Ze kost ons twee dingen:

1. **Dekking.** Bij de lopende CRI-run beoordeelt Timo 100 rijen die samen 2.007 van de 13.407
   producten dekken (15 %). De andere 85 % gaat ongezien mee.
2. **Schaal.** Dertig merken × 100 rijen met de hand is niet realistisch, en dertig merken ×
   álles al helemaal niet.

## De vondst die dit dringend maakt

Tijdens het uitschrijven van de faalvormen liep ik tegen een gemeten fout aan die niets met
schaal te maken heeft:

> **2.800 XAL-producten zouden als "dimbaar" gepubliceerd worden terwijl hun naam letterlijk
> `NON DIM` zegt.**

De parser zoekt `/\bDIM(?:MABLE)?\b/i` ([parser.ts:126](lib/enrichment/parser.ts:126)). In
`NON DIM` is `DIM` een eigen woord, dus het matcht — en de ontkenning ervoor wordt genegeerd. Het
resultaat is niet "een beetje onzeker" maar het **tegenovergestelde** van wat de fabrikant
opschrijft:

```
parser zegt 'DIM'  ←  THROUGH WIRING CONNECTION BOX NON DIM 3-POLE
parser zegt 'DIM'  ←  CANOPY CEIL 220-240V / 500mA NON DIM FOR ARY ROD SUSPENDED
```

Het zijn bovendien vrijwel allemaal **accessoires** — aansluitdozen, plafondkappen, ophangsets —
waar de vraag "is dit armatuur dimbaar" niet eens van toepassing is.

Dit is precies wat de vorige run zou hebben gepubliceerd als we dimbaarheid hadden meegenomen:
3.449 landende waarden, waarvan **2.800 (81 %) fout**. De keuze voor "alleen CRI" heeft dat per
ongeluk voorkomen. Een steekproef van 100 over zeven velden gaf dimbaarheid 26 plekken, waarvan
er ~5 op een landende rij vielen — de kans dat een mens deze fout tegenkwam was reëel maar niet
zeker, en de kans dat hij hem als *systematisch* herkende nog kleiner.

## De faalvormen, per veld

De kern van deze opdracht. Elke regel hieronder is geïmplementeerd en getest in
`lib/enrichment/verdenking.ts`.

| veld | faalvorm | wat er misgaat |
|---|---|---|
| **dimmable** | `ontkenning` | `NON DIM`, `NOT DIMMABLE`, `EXCL DIM` → de parser leest `DIM`. **Levert de omgekeerde waarde op.** |
| | `meerdere-protocollen` | DALI én TRIAC in één naam; de parser kiest op volgorde, niet op betekenis |
| **kelvin** | `bereik` | `2700-6500K` (tunable white): alleen 6500 wordt door `K` gevolgd, dus dát wordt de waarde — willekeurig |
| | `tunable-white` | `TW`, `DIM TO WARM`, `D2W`: één vaste kelvin is misleidend |
| | `meerdere-waarden` | `3000K/4000K` → de eerste wint |
| **cri** | `meerdere-waarden` | `CRI80/90` → de eerste wint |
| | `buiten-bereik` | de parser accepteert 1–100; onder 70 is praktisch onzin |
| **beamAngle** | `kantelhoek` | `30° TILT` / `ADJUSTABLE 24°`: de graden zijn de kantelbaarheid, niet de bundel |
| | `bereik` | `20-60°` |
| **ipValue** | `onbekende-klasse` | `IP19`, `IP99` — geen bestaande klasse, dus een lees- of bronfout |
| | `meerdere-waarden` | armatuur IP20 + accessoire IP44 |
| **maxWattage** | `meerdere-waarden` | twee W-getallen (armatuur + driver) |
| **lumenOutput** | `meerdere-waarden` | idem |
| *alle velden* | `accessoire-context` | de naam noemt `EXCL`/`DRIVER`/`BRACKET`: het getal kan bij het onderdeel horen |
| | `afgekapt` | de naam houdt halverwege op; wat erachter stond is onbekend |

Twee regels die ik tijdens het testen heb moeten bijstellen, omdat ze te grof waren:

- `DALI` en `LED` aan het eind van een naam gelden **niet** als afgekapt. Ze staan in duizenden
  XAL-namen legitiem als laatste token; ze meenemen vlagde elke normale naam. Een filter dat
  alles verdenkt, selecteert niets.
- `EXCL. DIMMER` levert géén vlag, want de parser leest daar helemaal geen dimbaarheid uit
  (`\bDIM\b` matcht niet in `DIMMER`). Over een leeg veld valt niets te zeggen — ook hier niet.

## Hoe groot is het verdachte deel? (XAL, gemeten)

| veld | voorstellen | landt op lege kolom | verdacht | % |
|---|---|---|---|---|
| maxWattage | 28.322 | 0 | 0 | — |
| kelvin | 27.850 | 0 | 0 | — |
| **cri** | 13.407 | **13.407** | 798 | **6,0 %** |
| ipValue | 2.087 | 0 | 0 | — |
| beamAngle | 1.295 | 0 | 0 | — |
| lumenOutput | 0 | 0 | 0 | — |
| **dimmable** | 17.699 | **3.449** | 2.800 | **81,2 %** |
| **totaal** | 90.660 | **16.856** | **3.598** | **21,3 %** |

Per faalvorm, alleen over wat landt:

```
dimmable:ontkenning            2800
cri:accessoire-context          740
dimmable:afgekapt               463
cri:afgekapt                     58
dimmable:accessoire-context      28
```

Wat opvalt: bij CRI is er **geen enkele** `meerdere-waarden` of `buiten-bereik`. Dat bevestigt de
tokenanalyse uit het vorige doc langs een andere weg — de 13.407 CRI-waarden komen uit vijf
letterlijke tokens en er is geen naam waarin een tweede kandidaat staat. De 798 CRI-verdenkingen
gaan over context (accessoire, afgekapt), niet over de lezing zelf.

Daarnaast dragen **104 naamvormen meerdere waarden** (3.009 items, 17,9 % van wat landt). Daar
zegt een oordeel over één rij niets over de rest van die vorm — de reden dat groepsverwerping op
`nameShape` in het vorige plan sneuvelde.

## Alle 30 merken samen (gemeten)

| veld | voorstellen | landt op lege kolom | verdacht | % |
|---|---|---|---|---|
| maxWattage | 120.728 | 71.883 | 1.843 | 2,6 % |
| kelvin | 84.843 | 15.115 | 3.078 | 20,4 % |
| cri | 37.431 | 37.431 | 4.508 | 12,0 % |
| ipValue | 4.808 | 1.456 | 222 | 15,2 % |
| beamAngle | 30.912 | 8.224 | 2.517 | 30,6 % |
| lumenOutput | 8.411 | 2.686 | 238 | 8,9 % |
| dimmable | 41.738 | 20.887 | 5.717 | 27,4 % |
| **totaal** | **328.871** | **157.682** | **18.123** | **11,5 %** |

XAL blijkt een uitzonderlijk nette catalogus. Bij de andere merken verschijnen faalvormen die XAL
niet heeft: echte tunable-white-producten (`PLANO … 2000-3000K W-W`), drievoudige kleurtemperatuur
(`ROSS … 3000K/4000K/6000K`), een wattage dat bij een los voorschakelapparaat hoort
(`CV Driver 35W 24V IP67`), en een bundelhoek die een hoekprofiel beschrijft in plaats van een
lichtbundel (`OSCAR HORIZONTAL OUTER CORNER 225°-265°`).

De `NON DIM`-fout is niet XAL-specifiek: over alle merken 3.376 gevallen.

## Wat dit betekent voor de schaal — en een correctie op mijn eigen opzet

Ik had het voorfilter gedefinieerd als "verdacht ∪ naamvormen met meerdere waarden". Dat is fout,
en de meting maakt het zichtbaar: over alle merken dragen 7.134 vormen meerdere waarden, goed voor
**54.380 items (34,5 %)**. Zo gedefinieerd zou het filter 72.503 rijen selecteren — een factor 2,2
op 157.682, veel te weinig om dertig merken haalbaar te maken.

Maar een gemengde naamvorm is **geen verdenking**. Dat één vorm zowel `CRI80` als `CRI90` draagt
betekent alleen dat er varianten bestaan; de parser leest per product netjes de juiste waarde. Het
is een reden om niet op vorm te **generaliseren** — precies waarom groepsverwerping in het vorige
plan sneuvelde — niet een reden om te **controleren**. Twee verschillende dingen die ik door
elkaar haalde.

Zonder die vermenging staat het er zo voor:

| | alle merken | XAL |
|---|---|---|
| landende voorstellen | 157.682 | 16.856 |
| verdacht (voorfilter) | **18.123** (11,5 %) | **3.598** (21,3 %) |
| agent-taken bij 20 rijen per batch | 906 | 180 |
| idem met dubbele bezetting | 1.812 | 360 |

Per merk is dat werkbaar. In één keer over alle merken niet — dus de zwerm draait per merk, wat
sowieso al zo is: `startEnrichmentRun` werkt per merk.

De echte winst zit er niet in dát het filter kleiner is, maar dat het de agents zet waar iets te
vinden valt. 81 % van de XAL-dimbaarheidsfouten zit in één faalvorm die een deterministische regel
volledig afvangt; daar hoeft geen agent naar te kijken — die moet worden **gerepareerd**, niet
beoordeeld. Waar agents wél voor nodig zijn, is de vraag die geen regel kan beantwoorden: *"deze
naam noemt een driver én een armatuur — bij welk van de twee hoort die 24 W?"*

## Wat de sprintmaster al heeft getest (niet opnieuw ontdekken)

- **Tien agents, twee rollen:** vijf bevestigers ("loop na en meld wat niet klopt") en vijf
  sceptici ("ga ervan uit dat er iets mis is"). Elke regel door twee tegengestelde brillen.
- **Data via een bestand op schijf, nooit inline in de prompt.** De eerste poging gaf de rijen als
  één lange string mee; agents kregen brokstukken als `[{"n": 1, "naam": "A`.
- **Elke agent moet terugmelden hoeveel regels hij werkelijk gelezen heeft.** Zonder die telling
  leest een leeg antwoord als "alles goedgekeurd" — exact de faalvorm die het vorige probleemdoc
  al beschreef.
- **Weigeren is gewenst gedrag.** De agents met kapotte data meldden "ik kan het niet zien" in
  plaats van te gokken. Dat moet de prompt expliciet afdwingen; het is de belangrijkste vangrail.

## Wat niet verandert

- Timo's go blijft. De zwerm levert **bewijs**, niet toestemming. Een agent publiceert nooit.
- Publiceren blijft achter de gepoorde scripts (`publiceer-run.ts`), nooit via de UI — het
  UI-pad heeft geen env-check ([app/data/actions.ts](app/data/actions.ts)).
- Alles op de branch tot Timo apart go geeft voor productie.

## Open vragen voor de plan-agents

1. Welke rijen krijgen een agent te zien: alleen de verdachte, of verdacht + een aselecte
   steekproef uit de rest? Hoe groot moet die aselecte greep zijn om te kunnen zeggen dat het
   filter niets structureels mist?
2. Wat is de eenheid van oordeel — de losse rij, of de naamvorm? De 104 gemengde vormen laten
   zien dat "vorm" te grof is als sleutel voor verwerping, maar misschien niet als eenheid van
   *beoordeling*.
3. Hoe voorkom je dat twee agents met tegengestelde instelling structureel oneens zijn zonder
   dat er iemand knopen doorhakt? Een derde agent, een menselijke tiebreak, of telt oneens
   automatisch als verdacht?
4. Wat is het contract van een agent-oordeel richting `enrichment_items.sampleVerdict`? Dat veld
   kent nu alleen `goed`/`fout` en is bedoeld voor een mens.
5. Hoeveel agents tegelijk, gegeven dat een run 16.856 rijen kan hebben en de concurrency
   begrensd is?
