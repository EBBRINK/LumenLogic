# Issue tracker: `docs/` (eigen conventie)

Dit repo heeft een GitHub-remote (`Timo-AInstein/lumenlogic`), maar **trackt niet in GitHub
Issues**. Specs en problemen leven als Markdown in `docs/`, volgens een conventie die er vóór
deze skills al was. Gebruik die — maak geen `.scratch/` aan.

## Conventies

Twee documentsoorten, per onderwerp één slug:

- **`docs/probleem-<slug>.md`** — wat er mis is, gemeten via het echte codepad. Reproductie,
  cijfers, en wat er precies fout gaat. Dit is de aanleiding, niet de oplossing.
- **`docs/goal-<slug>.md`** — wat we gaan bouwen. Beslissingen, de gekozen aanpak, de meetlat
  waaraan we afmeten, en na het bouwen: het gemeten resultaat plus een eerlijke sectie over wat
  er **niet** gehaald is. Verwijst boven aan naar het bijbehorende probleem-document.

Bestaande voorbeelden: `docs/goal-tekstrelevantie.md`, `docs/goal-variant-ranking.md`,
`docs/probleem-import-leest-verkeerd.md`.

Grotere brokken werk hebben daarnaast `docs/plan-<slug>.md` en `docs/sprint<N>-<M>-briefing.md`.
Die zijn historisch; nieuwe specs gaan naar `goal-`.

## Als een skill zegt "publish to the issue tracker"

Schrijf `docs/goal-<slug>.md`. Bestaat het al, werk het bij in plaats van een tweede bestand te
maken. Geen aparte triage-labels — dit is een solo-project, `Status:`-regels zijn overbodig.

## Als een skill zegt "fetch the relevant ticket"

Lees het pad dat Timo noemt. Zonder pad: zoek in `docs/` op de slug, en lees het `probleem-`
document mee als dat bestaat — de spec is zonder de meting niet te beoordelen.

## Tickets

Standaard slaan we `/to-tickets` over; `/implement` werkt vanaf de goal-doc. Is een spec te groot
voor één contextvenster, dan komen de tickets als genummerde koppen **in dezelfde goal-doc** te
staan (`## 01 — <titel>`, met een `Blocked by:`-regel), niet als losse bestanden. Eén document per
onderwerp blijft de regel.

## Wayfinding

`/wayfinder` is hier niet in gebruik. Wordt het dat ooit, dan wordt de map
`docs/map-<effort>.md` met dezelfde genummerde-koppen-aanpak.
