# Goal: de gebruiker kiest het tabblad

Fase 2 van `/goal meerdere-tabbladen`. Probleem en meting staan in
`docs/probleem-meerdere-tabbladen.md` (armaturenlijst woning Bos: tabblad 1 Delta Light,
tabblad 2 Wever & Ducré — het tweede blad verdwijnt vandaag zonder een woord).

**Vaststaand besluit (Timo, 20 aug 2026, niet heropenen): de gebruiker kiest het tabblad.**
Bij meer dan één tabblad met herkenbare data toont de upload een keuzelijst met per blad de
naam en het aantal gevonden regels. Samenvoegen is expliciet afgewezen: de tabbladen van het
Bos-bestand zijn alternatieven (102 armaturen op papier, 53 aan het plafond), geen
vervolgbladen.

**Volgorde:** dit werk gaat ná `docs/goal-bestek-kopwoorden.md` (zelfde bestanden). Zonder
werkende koprij-herkenning is "aantal gevonden regels" voor elk Bos-blad ~9 onzinregels en
liegt de keuzelijst. De spec hieronder gaat uit van een gerepareerde `detectHeader`.

**Terminologie:** dit heet overal *tabblad-keuze* (sheet choice), nooit "variant" —
`variant` betekent in deze codebase kleurvariant van één product
(`lib/repo/variants.ts`, zie de waarschuwing in `docs/probleem-varianten.md`).

## Testnaden — GOEDGEKEURD (Timo, 20 aug 2026)

> Alle vijf de open keuzes zijn beantwoord, telkens conform de aanbeveling van de planner.
> De spec is definitief.
>
> 1. **Verborgen tabbladen:** tellen niet mee. Akkoord — een verborgen legenda-blad met
>    toevallig herkenbare data mag geen keuzescherm afdwingen.
> 2. **Rijnummer-bug in het >15 MB-clientpad:** meteen meenemen. Akkoord — het blok gaat
>    toch open, de fix is het `rowNumber`-argument van `eachRow` gebruiken, en het huidige
>    gedrag is in strijd met de "rijgrenzen zijn heilig"-regel in `lib/table/parse-rows.ts`.
> 3. **Niet-databladen:** één samenvattingsregel, geen grijze rijen. Akkoord.
> 4. **Annuleren vanuit de keuzelijst:** ja, en dezelfde upload blijft hervatbaar. Akkoord.
> 5. **Screenshot-naad (N5):** bevestigd — die dekt de staande eis uit `CLAUDE.md` voor
>    deze klus. De zusterspec `docs/goal-bestek-kopwoorden.md` is er expliciet van
>    vrijgesteld omdat daar geen UI in scope zit; hier dus wél.
>
> Aanbevelingen (a) en (c) van de planner staan ongewijzigd: volledig proefdraaien met
> `parseSpecLinesFromRows` per blad, en één gedeelde beslisfunctie `lib/table/sheet-choice.ts`
> die het gechunkte pad en het >15 MB-pad allebei gebruiken.

### De naden

De staande eis (white-box RSC-test met screenshots, light/dark × mobile/desktop) is hier van
toepassing: de keuzelijst is nieuwe UI in `pdf-upload-card.tsx`. Voorgestelde naden:

**N1 — `lib/table/sheet-choice.ts` (nieuw, puur, unit-test).** De beslisfunctie die beide
uploadpaden delen: `[{index, name, lines, hidden}] → {auto: index} | {choose: […]} |
{fallback: index}`. Tests: twee databladen → keuze; precies één datablad → auto (óók als
het niet het eerste blad is); nul databladen → fallback naar huidig gedrag; verborgen blad
telt niet mee. Dit is de naad die garandeert dat serverpad en clientpad nooit verschillend
kunnen beslissen.

**N2 — `lib/table/rows-from-xlsx.test.ts` uitbreiden.** Nieuwe export `sheetsFromXlsx`
(alle bladen met naam), fixture-workbook met twee databladen + één legenda-blad + één
verborgen blad, in-test gebouwd met exceljs (bestaand patroon in dit testbestand).

**N3 — telling-invariant in `lib/table/parse-rows.test.ts`.** Pin vast dat
`parseSpecLinesFromRows(rows, brandNames).lines.length ===
parseSpecLinesFromRows(rows, []).lines.length` — daar leunt de hele client/server-
consistentie op (het clientpad heeft geen merkenlijst; zie §c).

**N4 — actiepad met PGlite (naast `lib/repo/table-imports.test.ts`).** Finish op een
multi-sheet-bron zonder `sheetIndex` → `{sheetChoice}` en de run blijft `voorstel`
(geen regels geschreven); finish mét `sheetIndex` → alleen de regels van dat blad, en het
`source_file_stored`-event draagt `sheet: {index, name, lines}`. Dubbele finish blijft
idempotent.

**N5 — white-box RSC-test met screenshots** (uitbreiding `pdf-upload.test.tsx` +
`pdf-upload-test-stubs.tsx`). Stubs volgens het bestaande patroon (registratie via
`window.__…`):
- `KaartMetTabelSheetKeuze`: finish antwoordt `{sheetChoice: 2 bladen}`; de kaart toont de
  keuzelijst; gebruiker kiest blad 2; de tweede finish-call moet `sheetIndex: 2` dragen
  (window-registratie) en redirect dan → handoff. **Screenshots van de keuzelijst-toestand:
  light/dark × mobile/desktop.**
- `KaartMetTabelEenBlad`: finish redirect direct (geen `sheetChoice`) — geen keuzescherm,
  nul extra klikken; assert dat de keuzelijst nooit in de DOM stond.
- `KaartMetRijenFallbackMeerdereBladen`: >15 MB-pad met een multi-sheet-fixture — de kaart
  toont dezelfde keuzelijst vóór er iets verstuurd is, en `importTabelRowsAction` ontvangt
  alléén de rijen van het gekozen blad plus `sheetName`/`sheetCount`.

### Open keuzes — vraag aan Timo, mét aanbeveling

1. **Verborgen tabbladen** (exceljs `worksheet.state: 'hidden' | 'veryHidden'`): meenemen in
   de keuze? **Aanbeveling: nee** — een verborgen legenda-blad met toevallig herkenbare data
   zou anders een keuzescherm afdwingen voor wat de gebruiker als één-blads-bestand ziet.
2. **Rijnummer-bug in het >15 MB-clientpad meteen meenemen?** `pdf-upload-card.tsx:586`
   gebruikt `ws.eachRow((row) => …)` zónder lege rijen, waardoor rijnummers opschuiven en
   `sourcePage` daar niet klopt met wat de gebruiker in Excel ziet — in strijd met de
   "rijgrenzen zijn heilig"-regel van `lib/table/parse-rows.ts`. Dit blok wordt toch
   herschreven. **Aanbeveling: ja, meenemen** (het `rowNumber`-argument van `eachRow`
   gebruiken om lege rijen op te vullen, zelfde semantiek als `rowsFromXlsx`).
3. **Niet-databladen in de keuzelijst:** grijs tonen of alleen een samenvattingsregel?
   **Aanbeveling: samenvattingsregel** ("2 andere tabbladen zonder herkenbare regels
   overgeslagen") — de keuzelijst biedt alleen echte keuzes aan.
4. **Annuleren vanuit de keuzelijst?** **Aanbeveling: ja** — terug naar idle; de run blijft
   `voorstel` en hetzelfde bestand opnieuw kiezen hervat (chunks zijn al binnen, de
   keuzelijst verschijnt direct opnieuw).
5. **Screenshots-eis** — bevestiging dat N5 de staande naad dekt zoals bedoeld.

## a) Hoe het aantal regels per tabblad bepaald wordt

**Gekozen: volledig proefdraaien met `parseSpecLinesFromRows` per blad**, niet alleen
`detectHeader`.

Weging:
- `detectHeader` alleen zegt "hier staat een koprij", maar levert geen regelaantal — en het
  regelaantal ís de informatie waarop de gebruiker kiest (Bos: 53 vs 49). Ruwe rij-aantallen
  tonen zou liegen: een legenda-blad met 30 rijen en 0 spec-regels zou er kansrijk uitzien.
- De kosten zijn verwaarloosbaar. Het dure deel is `workbook.xlsx.load()` (één keer, gebeurt
  nu ook al); daarna is `parseSpecLinesFromRows` pure stringverwerking zonder AI, zonder DB
  (merkenlijst wordt éénmaal opgehaald, zoals nu). Op een 15 MB-workbook met een handvol
  bladen is dat ruim onder een seconde — de `maxDuration = 300` van
  `app/projects/[id]/page.tsx:47` komt niet in beeld. Wel betekent de keuze-flow dat de
  finish-action twee keer draait (proef + gekozen import) en het bestand dus twee keer uit
  de DB assembleert en laadt; dat is bewust — de actions blijven stateless, en 2 × laden
  van ≤15 MB past ruim in het budget.

**Definitie "tabblad met herkenbare data": `parseSpecLinesFromRows(rows, …).lines.length ≥ 1`.**
Niet-verborgen bladen zonder regels doen niet mee (zie open keuze 1 en 3).

Nieuwe leesfunctie in `lib/table/rows-from-xlsx.ts`:

```ts
export async function sheetsFromXlsx(bytes: Uint8Array): Promise<
  { index: number; name: string; hidden: boolean; rows: TableRows }[]
>;
```

`rowsFromXlsx` (eerste blad met inhoud) blijft als gedragsanker voor de fallback bestaan of
wordt een dun laagje over `sheetsFromXlsx` — implementatiekeuze, zolang het huidige gedrag
bij 0 databladen exact behouden blijft.

## b) Eén tabblad met data → geen keuzescherm

De meerderheid heeft één blad en mag er **geen klik** bij krijgen. De beslisregel (in
`lib/table/sheet-choice.ts`, gedeeld door beide paden):

- **0 databladen** → fallback naar huidig gedrag: eerste blad met inhoud (zelfde uitkomst,
  zelfde meldingen als vandaag — meestal 0 regels, dat probleem is
  `docs/probleem-liegende-import-melding.md`-terrein en blijft hier ongemoeid).
- **1 datablad** → dat blad, zonder keuzescherm. Let op: dit is een stille verbetering ten
  opzichte van vandaag — een workbook met legenda-blad vóór het datablad importeert nu het
  legenda-blad (0 regels) en straks het datablad. Pinnen met een test (N1/N2).
- **≥2 databladen** → keuzelijst, per blad naam + aantal gevonden regels.

CSV en docx hebben geen tabbladen en veranderen niet.

## c) Beide uploadpaden respecteren dezelfde keuze

De twee paden lopen vandaag uiteen (`rowsFromXlsx` pakt eerste blad-met-inhoud; het
clientpad pakt hard `worksheets[0]`, `pdf-upload-card.tsx:585`). De keuze-logica komt op
één adres (`lib/table/sheet-choice.ts`, puur, geen `"use client"`, geen DB) en beide paden
gebruiken hem.

### Gechunkt serverpad (≤15 MB): keuze via `finishTableImportAction`

`startTableImportAction` en `uploadSourceChunkAction` veranderen **niet**. De keuze zit in
de finish, zodat het één-blad-pad nul extra roundtrips houdt:

1. Client roept `finishTableImportAction({dossierId, runId})` zonder `sheetIndex`.
2. Server assembleert, en bij xlsx: `sheetsFromXlsx` → per niet-verborgen blad
   `parseSpecLinesFromRows` → beslisfunctie.
   - auto/fallback → importeert dat blad, gedrag als nu (redirect `?tabel=…&run=…`).
   - keuze nodig → **importeert niets**, laat de run op `voorstel` staan en antwoordt
     `{ sheetChoice: { sheets: [{index, name, lines}] } }`. Event
     `tabel_sheet_keuze_nodig` (regel 5), payload: het aangeboden lijstje.
3. Client toont de keuzelijst en roept finish opnieuw aan mét `sheetIndex`.
4. Server valideert (zod: `sheetIndex` optionele begrensde int; alleen geldig bij xlsx en
   alleen een index die in de eigen proef als datablad naar voren komt — anders eerlijke
   `{error}`), importeert dat blad, en zet `sheet: {index, name, lines}` in de payload van
   `source_file_stored`.

De bestaande idempotentie-poort (`status !== "voorstel"` → geweigerd) blijft precies zo
werken: de proef-finish rondt de run niet af, dus de tweede finish mag; een dubbele finish
ná de import blijft geweigerd. Tab dichtgeklapt tijdens de keuze → run blijft `voorstel`,
zelfde bestand opnieuw kiezen hervat via `startTableImport` (chunks `alreadyDone`) en de
keuzelijst verschijnt direct weer.

Return-type wordt:

```ts
type FinishTableImportAction = (input: {
  dossierId: string; runId: string; sheetIndex?: number;
}) => Promise<
  | { error: string }
  | { sheetChoice: { sheets: { index: number; name: string; lines: number }[] } }
  | void
>;
```

### >15 MB-clientpad: keuze in de browser, vóór het versturen

De client leest het workbook toch al zelf (exceljs-import in `runTableImport`). Wijziging:
alle niet-verborgen bladen naar rijen lezen (mét rijnummer-opvulling, open keuze 2), per
blad `parseSpecLinesFromRows(rows, [])` voor de telling, dezelfde beslisfunctie:

- auto/fallback → rijen van dat blad direct naar `importTabelRowsAction` (als nu).
- keuze nodig → dezelfde keuzelijst-UI; na de keuze gaan **alleen de rijen van het gekozen
  blad** de deur uit.

`parseSpecLinesFromRows` en `sheet-choice.ts` zijn pure modules zonder serverafhankelijkheden
en dus client-importeerbaar. De merkenlijst ontbreekt in de browser, maar het regelaantal is
daar aantoonbaar onafhankelijk van (`brandNames` stuurt alleen de merk/type-splitsing, nooit
het aantal) — testnaad N3 pint dat vast, zodat de client-telling en de server-telling nooit
uit elkaar kunnen lopen.

`importTabelRowsAction` krijgt twee optionele, gevalideerde velden voor het audit-spoor:
`sheetName` (string, max 255) en `sheetCount` (begrensde int) — die landen in de payload van
`source_file_skipped_too_large`. Meer weet de server op dit pad niet, en dat is al zo
(het bronbestand wordt daar bewust niet opgeslagen).

## d) Waar de keuze in de UI landt

In `components/dossier/pdf-upload-card.tsx`, als nieuwe tak van de bestaande
status-union — de union is er juist zodat toestanden elkaar per constructie uitsluiten:

```ts
type CardStatus =
  | { kind: "idle" } | { kind: "busy"; text: string }
  | { kind: "handoff"; text: string } | { kind: "error"; text: string }
  | {
      kind: "chooseSheet";
      sheets: { index: number; name: string; lines: number }[];
      skippedSheets: number; // samenvattingsregel (open keuze 3)
      confirm: (index: number) => Promise<void>;
    };
```

`confirm` sluit over het pad heen: op het gechunkte pad `finishTableImportAction({…,
sheetIndex})`, op het >15 MB-pad het versturen van de al in het geheugen staande rijen van
dat blad. Zo rendert één stuk UI beide paden en kán de weergave niet uiteenlopen.

Weergave: radiolijst binnen de bestaande kaart ("This file has 2 sheets with luminaire
lines — choose which one to import"), per blad `naam — N lines found`, een bevestigknop,
een annuleerknop (open keuze 4), en de samenvattingsregel voor overgeslagen bladen. Het
bestandsinput blijft op slot (`locked`) zolang de keuze openstaat. Alle action-aanroepen
blijven via `callAction()` lopen (redirect ≠ fout; `/login` = sessie verlopen).

## Meetlat

1. **Bos-bestand (geanonimiseerde fixture uit goal-bestek-kopwoorden):** upload toont een
   keuzelijst met twee bladen en hun regelaantallen; blad 2 kiezen importeert alléén de
   Wever & Ducré-regels; nergens 102 regels.
2. **Één-blads-bestand (bestaande fixtures):** exact het huidige aantal klikken en dezelfde
   redirect — geen keuzescherm in de DOM.
3. **Beide paden:** dezelfde beslisfunctie, aantoonbaar via N1 + N3 + de window-registraties
   in N5; het >15 MB-pad verstuurt nooit rijen van een niet-gekozen blad.
4. **Events (ijzeren regel 5):** `tabel_sheet_keuze_nodig` bij een aangeboden keuze; het
   gekozen blad in de payload van `source_file_stored` resp.
   `source_file_skipped_too_large`.
5. **Volledige suite groen + typecheck**, screenshots van de keuzelijst in vier varianten.

## Buiten scope (bewust)

- **Echte projectvarianten** — variant-veld op `spec_lines`/`quotes`, offerte per
  uitvoering, vergelijkscherm: geparkeerd in `docs/probleem-varianten.md`. Twee
  uitvoeringen naast elkaar blijft voorlopig: twee losse dossiers, elk met het juiste
  tabblad gekozen.
- **Beide bladen in één run importeren** (ook niet "achter elkaar als aparte runs") — dat is
  de afgewezen samenvoeg-reflex via een omweg.
- **Meldingen bij 0 gevonden regels** — bestaand terrein van
  `docs/probleem-liegende-import-melding.md`, gedrag blijft hier ongewijzigd.

## Na het bouwen (invullen bij oplevering)

- Gemeten resultaat op de Bos-fixture: …
- Niet gehaald / open eindes: …
