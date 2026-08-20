# Probleem: een echt bestek levert nul armaturen op

> Fase 1 van de werkwijze (probleem uitschrijven), 20 aug 2026. Aanleiding: de armaturenlijst
> van woning Bos (Noordeinde 6, Kloetinge, projectnr. 113-297, opgesteld 27-6-2026). Alle
> metingen hieronder zijn gedraaid met de échte parser op het échte bestand, read-only.
> Vervolg: `docs/goal-bestek-kopwoorden.md`.

## Het probleem in één regel

De koprij-herkenning is een exacte woordvergelijking, en een doorsnee bestekschrijver schrijft
`Ruimtenaam` in plaats van `Ruimte` — waarna de import terugvalt op positioneel lezen en er van
42 dataregels — samen 86 armaturen — precies nul overblijven.

## De meting

`lib/table/parse-rows.ts` losgelaten op het Bos-bestand, met de echte merkenlijst:

```
rijen uit het geïmporteerde tabblad: 102
koprij van het bestek (rij 8): ["Ruimtenr.","Ruimtenaam","Toelichting","","Aantal",
  "Functie","Codering","Soort","Fabrikant/type","Accessoire","Power supply","Montagewijze"]
=> gedetecteerde koprij: null | herkende kolommen: []
=> RESULTAAT: 9 spec-regels uit 102 bronrijen
```

Die 9 regels zijn geen armaturen. Het zijn `Project:`, `Opdrachtgever:`, `Betreft:`,
`Projectnr.:` (met aantal **113**, uit "113-297"), `Ruimtenr.`, de tussenkopjes
`BEGANE GROND` (rij 9), `VERDIEPING` (rij 60) en `BUITEN` (rij 96), en de totaalregel
`Aantallen` (rij 102).

Wat er hád moeten uitkomen: **42 dataregels, samen 86 armaturen.** Dat aantal is niet geschat —
het bestek telt op rij 102 zelf `Aantallen = 86`, en de som van de aantallen over die 42 regels
is exact 86. Daaronder 53 Delta Light Spy 39-spots, 2 Heli X, 2 NIME II, 3 Louis Poulsen
Toldbod en 1 CTO Trevi.

## Waarom het misgaat

Twee oorzaken, en de tweede blijft bestaan als je alleen de eerste oplost.

### Oorzaak 1 — de koprij wordt niet herkend

`HEADER_MAP.get(norm(cell))` is een exacte lookup (`lib/table/parse-rows.ts:96`); `norm` maakt
lowercase en stript alles buiten `[a-z0-9]`. Van de twaalf koppen in dit bestek staat er
precies één in `HEADER_KEYS`:

| Kop in het bestek | Genormaliseerd | Herkend? | Zou moeten zijn |
|---|---|---|---|
| Ruimtenr. | `ruimtenr` | nee | — (volgnummer, mag leeg) |
| Ruimtenaam | `ruimtenaam` | nee | `zone` |
| Toelichting | `toelichting` | nee | — |
| Aantal | `aantal` | **ja** | `quantity` |
| Functie | `functie` | nee | — |
| Codering | `codering` | nee | `fixtureCode` |
| Soort | `soort` | nee | — |
| Fabrikant/type | `fabrikanttype` | nee | `brandText` + `productText` |
| Accessoire | `accessoire` | nee | — |
| Power supply | `powersupply` | nee | — |
| Montagewijze | `montagewijze` | nee | — |

`detectHeader` eist ≥2 treffers binnen de eerste 10 rijen (`:110-125`). Eén treffer is te
weinig, dus `headerRow` wordt `null` en de parser gaat positioneel: kolom A = fixtureCode,
B = quantity, C = brandText, D = productText (`POSITIONAL`, `:128-133`). Kolom A is in dit
bestek de kolom `Ruimtenr.` en die is vrijwel overal leeg — en `if (!fixtureCode) continue`
(`:173-174`) gooit elke rij zonder waarde weg. Vandaar 9 in plaats van 42.

De gegevens zitten er dus gewoon in. `Codering` **is** de armatuurcode, `Ruimtenaam` **is** de
zone, `Fabrikant/type` **is** merk plus type. Het zijn drie onbekende woorden.

### Oorzaak 2 — dubbele codes worden stil weggegooid

Ook ná een geslaagde koprij-herkenning klopt het aantal niet. `parse-rows.ts:178` houdt een
`seen`-set op fixtureCode alleen; de eerste rij wint, de rest verdwijnt zonder melding.

Gemeten op hetzelfde bestand: van de 42 dataregels dragen er 40 een codering, en daarvan zijn
er maar 31 uniek. Dubbel zijn `Wand` (3×), `Plint` (2×) en de codes `9`, `12`, `19`, `20`, `21`,
`32` (elk 2×). Negen regels zouden alsnog verdampen.

En dat is niet op te lossen door de zone aan de sleutel toe te voegen, zoals eerst gedacht.
Doorgerekend: `fixtureCode` alleen geeft 31 regels, `fixtureCode + zone` 35 à 36, met
`productText` erbij 38. Alleen zónder dedup kom je op alle 42. Twee van de vijf regels die ook
mét zone sneuvelen zijn aantoonbaar een ánder armatuur dan hun buurregel (rij 37 `Decoratief`
naast rij 36 een Spy 39; rij 57 een NIME II naast rij 56 een Spy 39). `Codering` is in een
tabelbestek geen sleutel maar een groeps- of positielabel.

### Oorzaak 3 — een rij zonder codering wordt weggegooid

`if (!fixtureCode) continue` (`:173-174`) treft ook twee legitieme regels die wél een aantal en
een product hebben maar geen `Codering`: rij 97 (Buiten/Gevel, 3× Louis Poulsen Toldbod 155
zwart) en rij 99 (Terras/Pergola, 2× n.t.b.). Zonder die twee klopt de som van 86 niet meer.

### Oorzaak 4 — de ruimtenaam staat er maar één keer

`Ruimtenaam` is spaarzaam gevuld: 16 van de 42 rijen hebben een lege cel, want het bestek zet
de naam alleen op de eerste regel van elke ruimte (samengevoegde-cel-layout). Zonder doorvullen
mist ruim een derde van de regels zijn zone.

## Waarom dit nu urgent is

Dit is niet één rommelig bestand. `Ruimtenaam`, `Codering` en `Fabrikant/type` zijn volstrekt
normale koppen in een Nederlandse armaturenstaat. Elk bestek dat ze gebruikt levert vandaag
nul regels op, zonder foutmelding — de gebruiker ziet 9 onzinregels en moet zelf raden wat er
mis is. Zie ook `docs/probleem-liegende-import-melding.md`: een import die stil iets anders
doet dan de gebruiker denkt, is erger dan een import die weigert.

## Besloten op 20 aug 2026 (Timo)

1. **Aanpak:** woordenlijst uitbreiden **plus** deelwoord-matching (`ruimtenaam` bevat `ruimte`,
   `fabrikanttype` bevat `fabrikant`). Deterministisch, geen AI — dat blijft de arbitrage uit
   `docs/goal-import-meer-formaten.md`.
2. **Dubbele codes:** ~~dedup-sleutel wordt `fixtureCode + zone`~~ — **herzien later op
   20 aug na hermeting.** Die sleutel haalt de meetlat niet (35 à 36 van de 42). Nieuw besluit:
   **de dedup vervalt op het tabelpad.** Elke dataregel wordt één spec-regel. De `seen`-set in
   `parseTocText` (PDF-inhoudsopgave) blijft ongewijzigd — dáár ís een fixture-code wél een
   sleutel.
2b. **Rij zonder codering:** blijft een spec-regel als er een **product** staat. Niet "een
   aantal óf een product" — zo stond het eerst en dat is bij het bouwen weerlegd: de
   totaalregel op rij 102 heeft precies dat profiel (`Aantal = 86`, geen codering, geen
   product) en zou dan als 43e armatuur van 86 stuks meetellen, waarmee de som op 172 komt
   en het controlegetal omvalt. Alleen-een-getal is geen armatuur. Raakt rij 97 (3× Toldbod)
   en rij 99 (2× n.t.b.), die allebei wél een product dragen
   (oorzaak 3). Volgt uit hetzelfde principe en is nodig om op 86 uit te komen.
2c. **Zone doorvullen** tot de volgende niet-lege ruimtenaam (oorzaak 4).
3. **Testfixture:** een geanonimiseerde kopie van het Bos-bestand in de repo — zelfde koprij en
   kolomstructuur, maar projectnaam, adres en opdrachtgever vervangen. Het echte bestand gaat
   niet in git.

## Valkuil voor de planner

Deelwoord-matching introduceert een botsing die er nu niet is: `Ruimtenr.` bevat óók `ruimte`
en staat vóór `Ruimtenaam`. De regel "eerste kolom met een kopwoord wint" (`:88-94`) zou de
zone dan aan de lege kolom A binden. Kies een tiebreak (langste match wint, of exact vóór
deelwoord) en pin die vast met een test. Idem voor `fabrikanttype`, dat zowel `fabrikant` als
`type` bevat.
