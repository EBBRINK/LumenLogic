// Parser-naad (goal-import-meer-formaten): koprij-detectie, rij-mapping,
// sourcePage = 1-gebaseerd rijnummer, en het markdown-controlespoor.
import { expect, test } from "vitest";
import {
  detectHeader,
  parseSpecLinesFromRows,
  rowsToMarkdown,
} from "./parse-rows";

const BRANDS = ["XAL", "iGuzzini", "Axo Light"];

test("koprij herkend: kolommen op naam, data eronder, sourcePage = echt rijnummer", () => {
  const rows = [
    ["Armaturenstaat gebouw B", "", "", ""], // titelrij vóór de kop
    ["Code", "Aantal", "Fabricaat", "Type", "Kelvin", "IP"],
    ["Lp301", "12", "XAL", "SASSO 100", "3000", "44"],
    ["", "", "", "", "", ""], // lege rij — telt mee in de nummering
    ["Lw201", "4", "", "iGuzzini Laser Blade 2700K", "", ""],
  ];
  const { lines, headerRow } = parseSpecLinesFromRows(rows, BRANDS);
  expect(headerRow).toBe(1);
  expect(lines).toHaveLength(2);

  expect(lines[0]).toMatchObject({
    fixtureCode: "Lp301",
    quantity: 12,
    brandText: "XAL",
    productText: "SASSO 100",
    reqKelvin: 3000,
    reqIp: "44",
    sourcePage: 3, // rij 3 in het bronbestand, niet "eerste dataregel = 1"
  });

  // geen merk-kolomwaarde → splitBrandType op de omschrijving (zelfde helper als PDF),
  // en de inline 2700K wordt deterministisch gelezen omdat de Kelvin-kolom leeg is
  expect(lines[1]).toMatchObject({
    fixtureCode: "Lw201",
    brandText: "iGuzzini",
    productText: "Laser Blade 2700K",
    reqKelvin: 2700,
    sourcePage: 5,
  });
});

test("expliciete kolomwaarde wint van de inline lezing", () => {
  const rows = [
    ["code", "aantal", "merk", "type", "kelvin"],
    ["Lp001", "2", "XAL", "SASSO 4000K", "3000"],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BRANDS);
  expect(lines[0].reqKelvin).toBe(3000); // kolom, niet de 4000K uit de tekst
});

test("zonder koprij: positioneel als de CSV-plak-flow (code · aantal · merk · type)", () => {
  const rows = [
    ["Lp301", "12", "XAL", "SASSO 100"],
    ["Lp301", "9", "XAL", "dubbel — eerste rij wint"],
    ["Lw002", "", "", ""],
  ];
  const { lines, headerRow } = parseSpecLinesFromRows(rows, BRANDS);
  expect(headerRow).toBeNull();
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatchObject({
    fixtureCode: "Lp301",
    quantity: 12,
    brandText: "XAL",
    sourcePage: 1,
  });
  // geen aantal → default 1 (zoals de PDF-inhoudsopgave)
  expect(lines[1]).toMatchObject({ fixtureCode: "Lw002", quantity: 1, sourcePage: 3 });
});

test("één kopwoord in een gewone rij maakt nog geen koprij", () => {
  const rows = [
    ["Lp301", "1", "XAL", "Type A"], // "Type A" ≠ kop; 1 treffer is te dun
    ["Lp302", "2", "XAL", "Type B"],
  ];
  expect(detectHeader(rows).headerRow).toBeNull();
  expect(parseSpecLinesFromRows(rows, BRANDS).lines).toHaveLength(2);
});

test("artikelnummer-kolom komt onaangetast in reqArticleCode", () => {
  const rows = [
    ["code", "artikelnummer", "omschrijving"],
    ["Lp301", "21012 0298", "Downlight"],
  ];
  const { lines } = parseSpecLinesFromRows(rows, BRANDS);
  // spaties horen bij de code zoals de klant hem opschreef (normaliseren doet de matcher)
  expect(lines[0].reqArticleCode).toBe("21012 0298");
});

test("rowsToMarkdown: nette tabel met scheidingsregel, pipes ge-escaped", () => {
  const md = rowsToMarkdown([
    ["Code", "Type"],
    ["Lp301", "SASSO | PRO"],
  ]);
  expect(md).toBe(
    "| Code | Type |\n| --- | --- |\n| Lp301 | SASSO \\| PRO |",
  );
});
