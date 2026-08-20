// Beslisnaad (goal-meerdere-tabbladen N1). Dit is de plek die garandeert dat het
// gechunkte serverpad en het >15 MB-clientpad nooit een verschillend tabblad kiezen —
// beide roepen chooseSheet aan, dus wat hier vaststaat, staat daar vast.
import { expect, test } from "vitest";
import {
  MAX_SHEETS,
  chooseSheet,
  isChoosableSheet,
  summarizeSheets,
  type SheetSummary,
} from "./sheet-choice";

const blad = (o: Partial<SheetSummary> & { index: number }): SheetSummary => ({
  name: `Blad ${o.index}`,
  lines: 0,
  headerRow: 0, // koprij herkend, tenzij een test anders zegt
  hidden: false,
  hasRows: true,
  ...o,
});

test("twee databladen: de gebruiker kiest, mét naam en regelaantal", () => {
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Delta Light", lines: 42 }),
    blad({ index: 2, name: "Wever en Ducre", lines: 42 }),
  ]);
  expect(beslissing).toEqual({
    kind: "choose",
    sheets: [
      { index: 1, name: "Delta Light", lines: 42 },
      { index: 2, name: "Wever en Ducre", lines: 42 },
    ],
    skipped: 0,
  });
});

test("precies één datablad: auto, ook als het niet vooraan staat", () => {
  // legenda-blad vóór het datablad — vroeger importeerde dat het legenda-blad
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Legenda", lines: 0 }),
    blad({ index: 2, name: "Armaturen", lines: 42 }),
  ]);
  expect(beslissing).toEqual({ kind: "auto", index: 2 });
});

test("nul databladen: fallback naar het eerste blad mét inhoud", () => {
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Leeg", lines: 0, hasRows: false }),
    blad({ index: 2, name: "Toelichting", lines: 0, hasRows: true }),
  ]);
  expect(beslissing).toEqual({ kind: "fallback", index: 2 });
});

test("nul bladen: fallback op blad 1 in plaats van omvallen", () => {
  expect(chooseSheet([])).toEqual({ kind: "fallback", index: 1 });
});

test("verborgen blad telt niet mee — geen keuzescherm voor wat de gebruiker niet ziet", () => {
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Armaturen", lines: 42 }),
    blad({ index: 2, name: "Sjabloon", lines: 12, hidden: true }),
  ]);
  expect(beslissing).toEqual({ kind: "auto", index: 1 });
});

test("overgeslagen bladen worden geteld, verborgen bladen niet genoemd", () => {
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Delta Light", lines: 42 }),
    blad({ index: 2, name: "Wever en Ducre", lines: 42 }),
    blad({ index: 3, name: "Legenda", lines: 0 }),
    blad({ index: 4, name: "Toelichting", lines: 0 }),
    blad({ index: 5, name: "Sjabloon", lines: 0, hidden: true }),
  ]);
  expect(beslissing).toMatchObject({ kind: "choose", skipped: 2 });
});

test("isChoosableSheet: alleen een index die zélf als datablad naar voren kwam", () => {
  const bladen = [
    blad({ index: 1, name: "Delta Light", lines: 42 }),
    blad({ index: 2, name: "Wever en Ducre", lines: 42 }),
    blad({ index: 3, name: "Legenda", lines: 0 }),
    blad({ index: 4, name: "Verborgen data", lines: 9, hidden: true }),
  ];
  expect(isChoosableSheet(bladen, 2)).toBe(true);
  expect(isChoosableSheet(bladen, 3)).toBe(false); // geen regels
  expect(isChoosableSheet(bladen, 4)).toBe(false); // verborgen: niet aangeboden, niet toegestaan
  expect(isChoosableSheet(bladen, 9)).toBe(false); // bestaat niet
  expect(isChoosableSheet(bladen, 0)).toBe(false);
});

test("summarizeSheets: telt regels per blad, slaat verborgen bladen over", () => {
  const kop = ["Codering", "Ruimtenaam", "Aantal", "Fabrikant/type"];
  const samenvatting = summarizeSheets([
    {
      index: 1,
      name: "Delta Light",
      hidden: false,
      rows: [kop, ["1", "Hal", "3", "Spy 39"], ["2", "Keuken", "1", "Spy 39"]],
    },
    { index: 2, name: "Legenda", hidden: false, rows: [["Toelichting"]] },
    { index: 3, name: "Sjabloon", hidden: true, rows: [kop, ["9", "X", "1", "Y"]] },
    { index: 4, name: "Leeg", hidden: false, rows: [] },
  ]);
  expect(samenvatting).toEqual([
    { index: 1, name: "Delta Light", lines: 2, headerRow: 0, hidden: false, hasRows: true },
    // let op: het legendablad levert positioneel wél een "regel" op (kolom A wordt dan
    // de armatuurcode), maar zonder koprij telt hij niet als datablad
    { index: 2, name: "Legenda", lines: 1, headerRow: null, hidden: false, hasRows: true },
    { index: 3, name: "Sjabloon", lines: 0, headerRow: null, hidden: true, hasRows: true },
    { index: 4, name: "Leeg", lines: 0, headerRow: null, hidden: false, hasRows: false },
  ]);
  expect(chooseSheet(samenvatting)).toEqual({ kind: "auto", index: 1 });
});

test("een blad zonder koprij is geen keuze, ook al levert het positioneel regels op", () => {
  // Dit is de 90%-regel uit docs/probleem-meerdere-tabbladen.md: één echt datablad naast
  // een toelichtingstabje mag géén extra klik kosten.
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Toelichting", lines: 3, headerRow: null }),
    blad({ index: 2, name: "Armaturen", lines: 42 }),
  ]);
  expect(beslissing).toEqual({ kind: "auto", index: 2 });
});

test("alleen bladen zonder koprij: fallback naar het eerste blad met inhoud, als vroeger", () => {
  // de CSV-plak-vorm zonder koprij mag niet ineens anders gaan werken
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Blad1", lines: 4, headerRow: null }),
    blad({ index: 2, name: "Blad2", lines: 2, headerRow: null }),
  ]);
  expect(beslissing).toEqual({ kind: "fallback", index: 1 });
});

test("koprij-blad wint van een koprijloos blad, en dat telt als niet-aangeboden", () => {
  // Eerlijk benoemd gedrag, geen toeval: heeft blad A geen herkende koprij maar wél
  // positionele regels, en blad B wél een koprij, dan importeren we B zonder te vragen.
  // We kiezen het blad dat we écht begrijpen. Vóór deze feature won A (eerste blad met
  // inhoud); er verdwijnt dus nog steeds een blad zonder keuze, maar wél het slechtere.
  // De samenvattingsregel zegt daarom "not offered", niet "geen regels gevonden".
  const beslissing = chooseSheet([
    blad({ index: 1, name: "Geplakte lijst", lines: 12, headerRow: null }),
    blad({ index: 2, name: "Armaturen", lines: 42 }),
  ]);
  expect(beslissing).toEqual({ kind: "auto", index: 2 });
});

test("een blad voorbij MAX_SHEETS wordt niet aangeboden en ook niet geaccepteerd", () => {
  // Anders zou de server een blad aanbieden dat zijn eigen zod-schema daarna weigert.
  const bladen = [
    blad({ index: 1, name: "Delta Light", lines: 42 }),
    blad({ index: MAX_SHEETS + 1, name: "Ver weg", lines: 42 }),
  ];
  expect(chooseSheet(bladen)).toEqual({ kind: "auto", index: 1 });
  expect(isChoosableSheet(bladen, MAX_SHEETS + 1)).toBe(false);
});
