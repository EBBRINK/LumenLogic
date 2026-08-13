# Goal: interne template-upload wordt directe import (vervang-semantiek)

_Volgt op `docs/probleem-template-upload-grote-bestanden.md`. Besluiten van Timo, 11 aug 2026._

## De koerswijziging

Het goedkeurscherm ("beslis veld voor veld") vervalt voor **interne** uploads door Brink.
Rationale (Timo): een nieuw bestand wordt alleen geüpload als het vorige niet meer klopt.
Het nieuwe bestand is dan integraal leidend; het oude gaat op archief. Er valt niets per
veld te beslissen — het is een vervanging, geen samenvoeging.

Dit is een bewuste breuk met besluit "de mens beoordeelt het voorstel" uit
`docs/plan-1-2-retourpad.md`, en geldt alleen voor het interne pad. Zodra het merkportaal
(4.B) merken zélf laat uploaden, is een beoordelingsstap daar opnieuw te bezien — een merk
is geen Brink-medewerker.

## Besluiten

1. **Vervang-semantiek, alles auto-toepassen.** Nieuwe waarden, gewijzigde waarden én
   leeggemaakte velden: het bestand wint. Het oude gegevensbeeld blijft terugvindbaar via
   het event-log (per veld old/new, zoals `product_fields_applied` nu al logt) en via de
   gearchiveerde prijslijst.
2. **Oude prijslijst automatisch op archief** zodra de nieuwe actief wordt. Let op: de
   archiveerfuncties bestaan al maar zijn nooit op het import-pad aangesloten — dit is
   het moment om dat te doen.
3. **Prijslijst-metadata via een klein formulier bij de upload**: naam, geldig-van,
   geldig-tot, naast de bestandskeuze. Geen aparte goedkeurstap; dit is de enige
   menselijke invoer. Alle drie verplicht (een lijst zonder einddatum voedt ijzeren
   regel 3 niet).
4. **Validatie blijft volledig staan.** `lib/excel-validate.ts` (1.1, ongewijzigd) blijft
   de poort: een format-afwijzing importeert niets, met dezelfde meldingen als nu. De
   byte-cap blijft; er komt een ruime sanity-rij-cap als transportgrens (geen 2000 —
   catalogus-formaat is nu juist het doel; orde 60.000, zie plan B).
5. **Alles gelogd.** Eén import = één samenvattend event met tellingen (nieuw, gewijzigd,
   geleegd, prijsregels) plus de bestaande per-veld-events. IJzeren regel 5.
6. **Schaal**: geen staging-jsonb van tientallen MB's meer nodig — er is geen
   voorstelscherm dat hem later herleest. Het bestand wordt gevalideerd en direct in
   batches toegepast. `maxDuration = 300` als vangnet op de betrokken pagina('s).
7. **Eerlijke voortgangs-UI**: de knop dekt nu écht "checken en importeren"; tekst
   daarop aanpassen, en na afloop een samenvatting op het merkscherm (tellingen), naar
   het model van de bestaande apply-summary.

## Open eindes (voor het implementatieplan)

- Wat gebeurt er met producten die in het oude bestand stonden maar in het nieuwe
  ontbreken? "Vervang-semantiek" suggereert: onzichtbaar/archief. Expliciet maken —
  dit raakt zoekresultaten en lopende projecten.
- Het bestaande staging/voorstel-pad (tabellen, schermen, actions): uitbouwen of laten
  staan voor 4.B? Niet slopen zonder besluit.
- Rondgang-test en RSC-screenshot-naad opnieuw snijden op het nieuwe pad.
