# Probleem: XAL's eigen specs staan in de naam, maar niet in de kolommen

> Fase 1 (probleem uitschrijven), 27 jul 2026. Alles hieronder is óf uit de code afgeleid met
> bestandsverwijzing, óf expliciet gemarkeerd als **nog niet gemeten**. Geen enkel getal in dit
> doc komt uit een nagebouwde SQL-query — die les is deze week vijf keer gesneuveld
> (`docs/probleem-variant-ranking.md`). De metingen volgen op een Neon-branch, via
> `scripts/eval-testset.ts`, met verse parse.

## Het probleem in één regel

De fabrikant zet zijn eigen CRI, kelvin, wattage en IP-klasse ín de productnaam
("SASSO 100 RD FL SUSP 1500 DALI 17,9W 3000K"), maar de bijbehorende kolommen op `products`
staan leeg — en de matcher kan alleen kolommen lezen, geen namen.

## Waarom dit erger is dan "een veld dat toevallig leeg is"

Een lege kolom is niet neutraal. Hij is een muur.

`judgeCri` ([tolerances.ts:86](lib/matching/tolerances.ts:86)) geeft bij een lege kolom het
oordeel `onbekend`. In `evaluateSpecLine` bepaalt dat oordeel vervolgens in welke lijst de
kandidaat valt ([engine.ts:703](lib/matching/engine.ts:703)):

```
list = !specless && !red && !unknown && !unconfirmed ? "aantoonbaar" : "onvolledig"
```

en de regelstatus komt uitsluitend uit die lijsten ([engine.ts:736](lib/matching/engine.ts:736)):
`anyGreen` kijkt alleen naar **aantoonbare** kandidaten, en `worstVerdict` zet één `onbekend`
al boven `groen` ([tolerances.ts:231](lib/matching/tolerances.ts:231)).

Daaruit volgt een harde uitspraak, puur uit de code, zonder meting:

> **Vraagt een spec-regel om CRI, en is `cri` leeg bij álle kandidaten, dan kan die regel nooit
> groen worden — en ook niet geel.** Hij valt terug op `open`.

Datzelfde geldt veld voor veld voor kelvin, IP, wattage, lumen en beam. De lege kolom
diskwalificeert niet de kandidaat maar de hele belofte "aantoonbaar". Met CRI gevuld op 3 van de
211.000 producten (briefing-getal, **nog niet geverifieerd**) is elke CRI-vragende regel in de
hele database dus structureel niet-groen.

De ranking heeft hetzelfde gat, maar zachter: `specScoreSql` telt een lege kolom als `0`
([engine.ts:361](lib/matching/engine.ts:361)) — bewust, want geen-data mag een product nooit
omlaag duwen (besluit 4). De commentaarregel erboven zegt het zelf al: cri en beam_angle
"dragen nu dus ~niets bij, maar zijn correct bedraad voor zodra verrijking ze vult". Dit doc gaat
over dat "zodra".

## Wat vullen precies verandert — twee kanten op

Dit is de kern van de meetdiscussie, en het is géén monotone verbetering.

| situatie | vandaag (kolom leeg) | na vullen, product voldoet | na vullen, product voldoet niet |
|---|---|---|---|
| veld-oordeel | `onbekend` | `groen` | **`rood`** |
| lijst | altijd `onvolledig` | kan `aantoonbaar` | uit beide lijsten (C-08) |
| regelstatus | hooguit `open` | kan `groen` | kan `rood` |
| specScore-term | `0` | `+1` | `−1` |

De rangkant: `SPEC_COEFF` is 0,15 ([engine.ts:346](lib/matching/engine.ts:346)), dus het verschil
tussen een voldoende en een onvoldoende kandidaat op één veld is 0,30 in de gecombineerde
sorteersleutel. Ter kalibratie: in `docs/probleem-wattage-dubbeltelling.md` besliste een marge van
**0,05** welke kandidaat top-1 werd. Eén nieuw gevuld veld is dus ruim genoeg om de volgorde om te
gooien — in beide richtingen.

Daarom moet "regressie" scherp gedefinieerd zijn, en de grill heeft dat al gedaan:

- **Echte regressie** = de juiste kandidaat (Jayden's artikelcode) zakt in rang, of een regel
  verslechtert doordat we een *verkeerde* waarde hebben ingelezen.
- **Geen regressie, maar eerlijker** = een regel gaat van `open` naar `rood` omdat het product
  aantoonbaar CRI 80 heeft terwijl het bestek 90 vraagt. Dat is precies wat de tool hoort te
  zeggen. Meetpunt 3 uit de grill: vullen maakt de status eerlijker, niet automatisch groener.

Een meting die deze twee niet uit elkaar houdt, keurt het goede resultaat af.

## Zwakke plek 1: publiceren is een eenrichtingsdeur

`rejectRun` werkt alleen zolang de status `steekproef` is
([enrichment.ts:495](lib/repo/enrichment.ts:495)). Ná `publishRun` bestaat er geen
terugdraai-functie — niet in de repo, niet in de UI.

Wat er wél is, en wat een gerichte terugdraai in principe mogelijk maakt:

- `enrichment_items.applied = true` per toegepast item ([enrichment.ts:441](lib/repo/enrichment.ts:441)) — het exacte spoor van wat er veranderd is;
- `products.tier2_source[field] = 'parsed-from-name'` ([enrichment.ts:433](lib/repo/enrichment.ts:433)) — per veld herleidbaar;
- `publishRun` vult **uitsluitend lege kolommen** ([enrichment.ts:429](lib/repo/enrichment.ts:429)), dus er is nooit een oudere waarde overschreven die je zou moeten herstellen. Terugdraaien = terug naar `NULL`, en dat is een verliesloze operatie.

De knop bestaat alleen niet. Op de branch is dat irrelevant (Reset from parent). Voor de latere
productie-run is het een expliciete afweging voor fase 2: bouwen we die knop, of leunen we op
branch-bewijs plus het feit dat terugdraaien technisch triviaal is?

## Zwakke plek 2: de steekproef ziet één rij per naamvorm, en een 'fout' verwerpt alleen díé rij

Dit is de ernstigste van de twee, en de rekensom maakt het pas zichtbaar.

`pickSampleIndices` stratificeert op `field|nameShape`
([enrichment.ts:88](lib/repo/enrichment.ts:88)). Zijn er méér naamvormen dan reviewplekken —
bij XAL vrijwel zeker, `SAMPLE_MAX` is 100 — dan loopt hij door dit pad
([enrichment.ts:108](lib/repo/enrichment.ts:108)):

```js
for (let s = 0; s < max; s++) chosen.add(strata.get(keys[...])![0]);
```

`[0]`: van elk gekozen stratum precies de **eerste** rij. De steekproef is dus 100 rijen, elk uit
een andere naamvorm — en dat is een goed ontwerp voor het *vinden* van een systematische
leesfout. Voor het *tegenhouden* ervan deugt hij niet, want `publishRun` past alles toe behalve
expliciet fout bevonden steekproef-items ([enrichment.ts:401](lib/repo/enrichment.ts:401)):

```js
const toApply = items.filter((i) => !(i.inSample && i.sampleVerdict === "fout"));
```

Zie je dat de parser bij naamvorm `sasso # rd fl susp # dali #,#w #k` de verkeerde waarde pakt,
dan markeer je die ene rij als fout — en alle andere producten met exact diezelfde vorm krijgen de
fout alsnog toegepast. De mens ziet het gat en kan het niet dichten.

Er is vandaag maar één middenweg-loze uitweg: `rejectRun`, de hele run weg. Dat is alles-of-niets
op een run van (naar schatting) tienduizenden items, dus in de praktijk kiest niemand hem voor één
verkeerde naamvorm.

**Ontwerpvraag voor fase 2:** moet een 'fout'-oordeel de hele `field|nameShape`-groep verwerpen in
plaats van één rij? Dat is een kleine, goed testbare wijziging in `publishRun` (groepeer de fout
bevonden items op `field|nameShape`, filter alle items met diezelfde sleutel weg), en het maakt de
steekproef pas echt een poort: wat je één keer ziet en afkeurt, geldt voor alles wat er hetzelfde
uitziet. De twee plan-agents moeten dit wegen — inclusief het tegenargument dat een te grove
`nameShape` (cijfers → `#`) hele families onterecht kan wegvegen.

## Wat de run méér doet dan CRI

`startEnrichmentRun` draait per merk en over **alle zeven velden tegelijk**
([enrichment.ts:203](lib/repo/enrichment.ts:203)); er is geen veld-filter. CRI is de aanleiding,
maar de run stelt ook kelvin, wattage, lumen, IP, beam en dimbaarheid voor. Dat vergroot het
oppervlak: de 100 steekproefplekken worden over zeven velden verdeeld (het stratum is
`field|nameShape`), dus per veld blijven er ~14 over.

Of we het bij CRI moeten houden of de hele run moeten draaien, is een echte fase-2-keuze. Alles
tegelijk is minder werk en dekt het doel "de lege spec-kolommen vullen" volledig; alleen CRI maakt
de meting scherper en de steekproef zeven keer dichter. Bouwen kost in beide gevallen ongeveer
hetzelfde, want een veld-filter is één `if` in de parse-lus.

Wat de poort betreft zit het goed: `parsed-from-name` staat **niet** in
`UNCONFIRMED_TIER2_SOURCES` — die set bevat alleen `optic-code`
([engine.ts:197](lib/matching/engine.ts:197)). Deze data is dus groen-waardig, anders dan onze
optiekcode-gok. Terecht: het is de fabrikant zijn eigen opgave.

## Wat NIET gemeten is (en op de branch moet gebeuren)

Geen van deze getallen is geverifieerd; ze staan hier als meetopdracht, niet als bevinding.

1. Hoeveel XAL-producten zijn er, en hoeveel dragen CRI in de naam? (briefing zegt ~11.000)
2. Hoeveel producten hebben vandaag een gevulde `cri`? (briefing zegt 3 van 211k, over álle merken)
3. Hoeveel items levert `startEnrichmentRun` voor XAL op, per veld?
4. Hoeveel distinct `field|nameShape`-strata zijn dat — dus welk deel van de naamvormen de
   steekproef van 100 daadwerkelijk ziet?
5. **Vragen de vier testcases überhaupt om CRI?** Zo niet, dan is de CRI-vulling voor die cases
   neutraal en meten we vooral "geen schade", niet "winst". Dat verandert niets aan de
   succesdefinitie (de grill heeft dat al vastgelegd), maar het moet vooraf op tafel.

Meetnoot: `dordrecht` heeft geen tekstlaag en vergt `--ai` met echte, betaalde calls
([eval-testset.ts:19](scripts/eval-testset.ts:19)). De nul- en nameting draaien daarom zonder
`--ai` op `raadhuis`, `kvk` en `tno`; `dordrecht` alleen als Timo daar apart go voor geeft.

## Vangrails die niet mogen sneuvelen

- **Alles op de Neon-branch.** Guard is fail-closed op een positief signaal: `LUMENLOGIC_DB=branch`
  moet aanwezig zijn, anders breekt het script af. Reden: `bun --env-file=…` faalt níét op een
  ontbrekend bestand (geverifieerd door de sprintmaster) en pakt dan stil de shell-omgeving —
  mogelijk productie. De host-vergelijking met de productie-host is het tweede slot, niet het eerste.
- **Nulmeting én nameting op de branch.** Nooit branch-na tegen productie-vóór; dat vergelijkt
  twee databases in plaats van één verandering.
- Geld nooit in de ranking; `visible_products` blijft de kandidatenbron (het is een view over
  `products`, dus gevulde kolommen werken automatisch door).
- Besluit 4: geen-data blijft een grijze vlag, nooit stil wegfilteren.
- Buiten scope: de rauwe Supabase-tabellen, en elk merk behalve XAL tot XAL bewezen is.

## Meetlat voor fase 3

1. De vier testcases gaan niet achteruit, gemeten via `scripts/eval-testset.ts` met verse parse —
   nulmeting en nameting allebei op de branch. Elke verslechtering wordt teruggevoerd op een
   oorzaak en beoordeeld als *fout ingelezen* (regressie, blokkeert) of *eerlijker geworden*
   (geen regressie, wordt vastgelegd).
2. De steekproef van 100 is menselijk beoordeeld en goedgekeurd door Timo — niet doorgeklikt.
3. Geen enkele schrijfactie op productie zonder expliciete go per run.
