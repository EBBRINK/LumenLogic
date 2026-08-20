// Welk tabblad importeren we? (goal-meerdere-tabbladen)
//
// Eén werkboek kan twee UITVOERINGEN van dezelfde armaturenstaat dragen — de
// armaturenlijst van woning Bos heeft blad "Delta Light" en blad "Wever en Ducre", elk
// 42 regels voor dezelfde plafonds. Optellen zou elke ruimte twee keer verlichten (84
// regels, 172 armaturen), dus de gebruiker kiest. Zie docs/probleem-meerdere-tabbladen.md.
//
// Deze module is met opzet PUUR: geen DB, geen "use client", geen exceljs. Het gechunkte
// serverpad (finishTableImportAction) en het >15 MB-clientpad (runTableImport in
// pdf-upload-card.tsx) roepen allebei dít aan. Dat is de hele reden dat hij bestaat: de
// twee paden liepen uiteen — de server pakte het eerste blad mét inhoud, de client hard
// worksheets[0] — en zo'n verschil is per constructie niet meer mogelijk.
import { parseSpecLinesFromRows, type TableRows } from "./parse-rows";

export type SheetSummary = {
  index: number; // 1-GEBASEERD, de positie op de tabjes zoals de gebruiker ze telt
  name: string;
  lines: number; // spec-regels uit een volledige proefparse, niet uit een rijentelling
  headerRow: number | null; // 0-gebaseerde koprij, null = positioneel gegokt
  hidden: boolean;
  hasRows: boolean; // heeft überhaupt inhoud — alleen voor de fallback
};

// Wat de gebruiker te zien krijgt als er iets te kiezen valt. Dit type reist van de
// server-action naar de kaart én van het clientpad naar dezelfde kaart, zodat één stuk
// UI beide paden rendert en de weergave niet kan uiteenlopen.
// Eén aangeboden blad, zoals de gebruiker het leest: "Wever en Ducre — 42 lines found".
// Reist als geheel van de action naar de kaart en van de kaart naar de event-payload;
// daarom één type in plaats van vier losse literals.
export type SheetOption = { index: number; name: string; lines: number };

export type SheetChoice = {
  sheets: SheetOption[];
  skipped: number; // zichtbare bladen die géén keuze zijn, als samenvattingsregel
};

// Bovengrens op wat we aanbieden én op wat een teruggestuurde index mag zijn — één
// getal, zodat de server nooit een blad aanbiedt dat zijn eigen schema daarna weigert.
// Ruim boven elk echt werkboek (een armaturenstaat heeft er twee tot vijf).
export const MAX_SHEETS = 256;

export type SheetDecision =
  // precies één blad met regels → importeren zonder iets te vragen
  | { kind: "auto"; index: number }
  // geen enkel blad met regels → exact het gedrag van vóór deze feature
  | { kind: "fallback"; index: number }
  // meer dan één → de gebruiker kiest
  | ({ kind: "choose" } & SheetChoice);

// Een blad telt mee als het niet verborgen is, er een KOPRIJ herkend is, én de proefparse
// er regels uit haalt. Alle drie de eisen hebben een reden:
//
//   • niet verborgen (besluit 1) — een verborgen legenda- of sjabloonblad met toevallig
//     herkenbare data mag geen keuzescherm afdwingen voor wat de gebruiker als
//     één-blads-bestand ziet;
//   • koprij herkend — zónder koprij gokt parseSpecLinesFromRows positioneel dat kolom A
//     de armatuurcode is, en dan levert een legendablad met één regel tekst in kolom A
//     al een "spec-regel" op. Dat blad zou dan een tweede keuze worden en de 90% met één
//     echt datablad een klik kosten. Gemeten, niet bedacht: [["Toelichting bij de
//     codes"]] geeft 1 regel. Dit is een bewuste aanscherping van de spec, die alleen
//     `lines >= 1` eiste (Timo, 20 aug);
//   • ≥ 1 regel — een blad mét koprij maar zonder data is geen keuze.
//
// Regressievrij: een blad zónder koprij valt in de fallback hieronder, en die kiest het
// eerste blad mét inhoud — exact wat er vóór deze feature gebeurde.
const isDataSheet = (s: SheetSummary) =>
  !s.hidden && s.headerRow != null && s.lines > 0;

export function chooseSheet(sheets: SheetSummary[]): SheetDecision {
  const data = sheets.filter((s) => isDataSheet(s) && s.index <= MAX_SHEETS);

  // Nul databladen → terug naar het oude gedrag: eerste blad mét inhoud, anders het
  // eerste blad dat er is. Dat levert meestal 0 regels op, en dát probleem hoort bij
  // docs/probleem-liegende-import-melding.md — hier verandert het bewust niet.
  if (data.length === 0) {
    const eerste = sheets.find((s) => s.hasRows) ?? sheets[0];
    return { kind: "fallback", index: eerste?.index ?? 1 };
  }

  // Eén datablad → geen keuzescherm, nul extra klikken. Let op: dit is een stille
  // verbetering. Een werkboek met een legenda-blad vóór het datablad importeerde
  // vroeger het legenda-blad (0 regels); nu het datablad, ook al staat het niet vooraan.
  if (data.length === 1) return { kind: "auto", index: data[0].index };

  return {
    kind: "choose",
    sheets: data.map(({ index, name, lines }) => ({ index, name, lines })),
    // Alleen ZICHTBARE bladen die geen keuze zijn — inclusief het legendablad dat
    // positioneel wél een "regel" oplevert maar geen koprij heeft. Een verborgen blad
    // noemen we niet: de gebruiker ziet dat tabje niet en zou zich afvragen welk blad
    // we bedoelen.
    skipped: sheets.filter((s) => !s.hidden && !isDataSheet(s)).length,
  };
}

// Mag deze index geïmporteerd worden? De client stuurt hem terug en client-invoer is
// nooit te vertrouwen: alleen een index die in ONZE eigen proef als datablad naar voren
// kwam telt. Anders zou een geknutselde sheetIndex een verborgen blad kunnen importeren.
export function isChoosableSheet(sheets: SheetSummary[], index: number): boolean {
  return sheets.some(
    (s) => s.index === index && isDataSheet(s) && s.index <= MAX_SHEETS,
  );
}

// Rijen per blad → de samenvatting waarop chooseSheet beslist. Ook dit hoort op één
// adres: zou de server anders TELLEN dan de client, dan toont de keuzelijst andere
// aantallen dan er geïmporteerd worden.
//
// Bewust ZONDER merkenlijst geteld. De browser heeft geen catalogus, dus kán daar niet
// mét merken geteld worden — en het hoeft ook niet: brandNames stuurt alleen de
// merk/type-splitsing, nooit óf een rij een regel is. parse-rows.test.ts pint die
// invariant vast ("het regelaantal hangt NIET van de merkenlijst af").
export function summarizeSheets(
  sheets: { index: number; name: string; hidden: boolean; rows: TableRows }[],
): SheetSummary[] {
  return sheets.map((s) => {
    // een verborgen blad parsen we niet eens — het doet toch niet mee
    const proef = s.hidden
      ? { lines: [], headerRow: null }
      : parseSpecLinesFromRows(s.rows, []);
    return {
      index: s.index,
      name: s.name,
      hidden: s.hidden,
      hasRows: s.rows.length > 0,
      lines: proef.lines.length,
      headerRow: proef.headerRow,
    };
  });
}
