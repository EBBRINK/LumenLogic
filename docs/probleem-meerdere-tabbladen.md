# Probleem: het tweede tabblad verdwijnt zonder een woord

> Fase 1 van de werkwijze (probleem uitschrijven), 20 aug 2026. Aanleiding: dezelfde
> armaturenlijst woning Bos als `docs/probleem-bestek-kopwoorden.md`. Vervolg:
> `docs/goal-meerdere-tabbladen.md`.

## Het probleem in één regel

Een armaturenstaat met twee uitvoeringen naast elkaar — tabblad 1 met Delta Light, tabblad 2
met Wever & Ducré — importeert alleen het eerste blad, en meldt niet dat het tweede bestaat.

## Wat er nu gebeurt

`lib/table/rows-from-xlsx.ts:39-41` pakt het eerste worksheet met inhoud. De motivering staat
er expliciet bij: *een armaturenstaat is één tabel, extra tabbladen zijn vrijwel altijd legenda
of lege sjabloonbladen.* Het clientpad voor bestanden boven 15 MB is nog strikter en neemt
`wb.worksheets[0]` (`components/dossier/pdf-upload-card.tsx:585`).

Die aanname klopt vaak, maar niet hier. Het Bos-bestand heeft twee tabbladen met dezelfde
plattegrond en dezelfde ruimtes, maar een andere spot:

| | Tabblad 1 | Tabblad 2 |
|---|---|---|
| Tabbladnaam | `Delta Light` | `Wever en Ducre` |
| Hoofdspot | Delta Light Spy 39 Trimless 24121 9220 B | Wever & Ducré 18486LQ3 |
| Aantal hoofdspots | 53 | 49 |
| Resterende Spy 39 | — | 6 (toilet, douches, badkamer) |
| Rijen · dataregels · som | 102 · 42 · 86 | 102 · 42 · 86 |
| Dimming | Dali-dim | Loxone |
| Bruto materiaal | € 23.413 | € 14.954 |

Let op: 53 en 49 zijn **spots**, niet regels en niet armaturen. Blad 2 houdt op zes plekken de
Delta Light Spy 39 aan, dus 49 + 6 = 55 spots daar tegen 53 op blad 1. Het werkboek bevat
verder géén legenda-, sjabloon- of verborgen blad: precies twee zichtbare tabbladen.

Het prijsverschil is € 8.459 op één woning. Dat is precies de vraag die de klant gesteld heeft,
en precies de helft die vandaag stil wegvalt.

## Waarom samenvoegen géén oplossing is

De voor de hand liggende reflex — lees alle tabbladen en plak ze achter elkaar — geeft hier
**84 spec-regels en 172 armaturen waar er 42 regels en 86 armaturen zijn** — precies het
dubbele. Beide bladen zijn namelijk vormgelijk: elk 102 rijen, elk 42 dataregels, en elk een
eigen totaalregel op rij 102 die `Aantallen = 86` zegt. Het zijn geen vervolgbladen maar
**alternatieven**: dezelfde plattegrond, dezelfde ruimtes, dezelfde coderingen, twee merken.
Optellen levert een offerte op die elke ruimte twee keer verlicht.

## De diepere beperking

Lumen Logic kent het begrip variant niet. Een dossier draagt één set spec-regels
(`db/schema.ts:496-550`, `spec_lines.dossier_id`) en `getQuote` pakt hard de oudste offerte met
`.limit(1)` (`lib/repo/dossiers.ts:651-657`) — één offerte per project, structureel. De versies
onder `luminaire-schedule/versions` lijken erop maar zijn iets anders: een oplopende
snapshot-keten van hetzelfde ontwerp op verschillende momenten
(`lib/repo/armaturenboek-versions.ts:110-122`), met een diff tussen twee tijdstippen. Twee
uitvoeringen kunnen daar niet naast elkaar bestaan.

"Variant" betekent in deze codebase iets anders: kleurvarianten van één product
(`lib/repo/variants.ts:40-60`, `docs/goal-variant-ranking.md`).

Dit document lost dat **niet** op — zie `docs/probleem-varianten.md`. Wat hier wél moet
gebeuren is dat de gebruiker niet langer bedrogen wordt over wat er is geïmporteerd.

## Besloten op 20 aug 2026 (Timo)

**De gebruiker kiest het tabblad.** Bij meer dan één tabblad met herkenbare data toont de
upload een keuzelijst met per blad de naam en het aantal gevonden regels. Voorkomt
dubbeltelling, maakt zichtbaar dat er een tweede uitvoering ligt, en is de natuurlijke opstap
naar echte varianten later.

Twee uitvoeringen naast elkaar zetten blijft voorlopig: twee losse dossiers aanmaken.

**"Tabblad met herkenbare data" — aangescherpt tijdens het bouwen (20 aug, akkoord Timo).**
De spec zei eerst `lines >= 1`. Dat bleek te ruim: een legendablad met alleen de cel
"Toelichting bij de codes" levert langs het positionele pad één regel op, want daar wordt
kolom A de armatuurcode. Elk bestand met een toelichtingstabje zou dan een keuzescherm
krijgen, in strijd met de harde eis dat de keuze géén extra klik mag worden voor de
meerderheid met één blad. De gebouwde definitie is daarom: **niet verborgen, én koprij
herkend, én minstens één regel.**

**Eerlijkheid over de dekking.** De feature maakt het niet in álle gevallen zichtbaar. Heeft
blad A geen koprij maar wel positionele regels, en blad B wél een koprij, dan wint B zonder
te vragen — er verdwijnt daar dus nog steeds een blad zonder keuze. Wel het slechtere blad,
en vóór deze feature won A puur omdat hij vooraan stond. Dat is vastgelegd als test en als
alinea in `docs/goal-meerdere-tabbladen.md`, niet weggepoetst.

## Aandachtspunten voor de planner

- Het aantal regels per tabblad is pas bekend ná parsing. De keuzelijst moet dus elk blad
  proefdraaien door `parseSpecLinesFromRows`, of op zijn minst door `detectHeader`.
- Eén tabblad met data → geen keuzescherm, gedrag blijft exact als nu. De keuze mag geen
  extra klik worden voor de 90% die één blad heeft.
- Het gechunkte uploadpad (`startTableImportAction` → `uploadSourceChunkAction` →
  `finishTableImportAction`, `app/projects/actions.ts:629-750`) en het >15 MB-clientpad
  (`importTabelRowsAction`, `:858`) moeten dezelfde keuze respecteren. Nu lopen ze uiteen:
  het clientpad kent `worksheets[0]` en zou de keuze stil negeren.
- Deze klus zit in dezelfde bestanden als `docs/probleem-bestek-kopwoorden.md`. Doe die eerst;
  zonder werkende koprij-herkenning is "aantal gevonden regels per tabblad" voor elk blad nul.
