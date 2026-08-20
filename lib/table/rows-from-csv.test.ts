// CSV-naad: delimiter-sniffing (';' / ',' / tab) en het Excel-quote-dialect.
import { expect, test } from "vitest";
import { rowsFromCsv, sniffDelimiter } from "./rows-from-csv";

test("sniffing: puntkomma, komma en tab worden elk herkend", () => {
  expect(sniffDelimiter("code;aantal;merk\nLp301;12;XAL")).toBe(";");
  expect(sniffDelimiter("code,aantal,merk\nLp301,12,XAL")).toBe(",");
  expect(sniffDelimiter("code\taantal\tmerk\nLp301\t12\tXAL")).toBe("\t");
});

test("sniffing: scheidingstekens binnen quotes tellen niet mee", () => {
  // 2× ';' buiten quotes; de komma's zitten allemaal binnen quotes → ';' wint
  expect(sniffDelimiter('code;merk;"SASSO, 100, PRO"')).toBe(";");
});

test("rowsFromCsv: quotes, dubbele quotes en newline binnen een cel", () => {
  const rows = rowsFromCsv(
    'code;type\nLp301;"SASSO; 100"\nLp302;"regel één\nregel twee"\nLp303;"zeg ""hoi"""\n',
  );
  expect(rows).toEqual([
    ["code", "type"],
    ["Lp301", "SASSO; 100"], // puntkomma binnen quotes splitst niet
    ["Lp302", "regel één\nregel twee"], // newline binnen quotes breekt de rij niet
    ["Lp303", 'zeg "hoi"'], // "" → letterlijke quote
  ]);
});

test("rowsFromCsv: BOM gestript, \\r\\n-regeleindes, lege rijen blijven staan", () => {
  const rows = rowsFromCsv("﻿code,aantal\r\nLp301,2\r\n\r\nLp302,3");
  expect(rows).toEqual([
    ["code", "aantal"],
    ["Lp301", "2"],
    [""], // lege rij blijft — rijnummers moeten kloppen met het bronbestand
    ["Lp302", "3"],
  ]);
});
