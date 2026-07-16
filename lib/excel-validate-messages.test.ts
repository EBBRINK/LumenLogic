// Tests bij lib/excel-validate-messages.ts. De kern: elke code uit de union heeft tekst,
// en die tekst noemt wát er mist (het acceptatiecriterium van 1.1). De exhaustieve lijsten
// hieronder zijn met opzet handgeschreven: ze zijn de wijzigingsdetector die voorkomt dat
// iemand een code toevoegt zonder tekst.
import { expect, test } from "vitest";
import {
  afwijzingsTekst,
  kolomLetter,
  samenvattingsTekst,
  waarschuwingsTekst,
} from "./excel-validate-messages";
import type { AfwijzingsReden, RijWaarschuwing } from "./excel-validate";

const ALLE_REDENEN: AfwijzingsReden[] = [
  { code: "onleesbaar_bestand", detail: "zip is corrupt" },
  { code: "werkblad_ontbreekt", verwacht: "Product data", gevondenWerkbladen: ["Sheet1"] },
  { code: "koprij_niet_herkend", gelezenKoprij: ["Artikel"], labelsGevondenOpRij: null },
  { code: "koprij_niet_herkend", gelezenKoprij: [], labelsGevondenOpRij: 3 },
  {
    code: "must_kolommen_ontbreken",
    ontbrekend: [
      { fieldKey: "category", labelEn: "Category", niveau: "must" },
      { fieldKey: "name_en", labelEn: "Product name (English)", niveau: "must" },
    ],
  },
  { code: "dubbele_kolomkop", labelEn: "Gross list price excl. VAT", kolommen: [10, 29] },
];

const ALLE_WAARSCHUWINGEN: RijWaarschuwing[] = [
  { code: "must_veld_leeg", rij: 4, fieldKey: "category", labelEn: "Category" },
  { code: "onbekende_artikelcode", rij: 5, artikelcode: "NIEUW-1" },
  { code: "dubbele_artikelcode", rij: 6, artikelcode: "DUP-1", ookOpRijen: [7] },
];

test("elke afwijzingsreden-code heeft een niet-lege tekst", () => {
  const gedekt = new Set(ALLE_REDENEN.map((r) => r.code));
  const verwacht: AfwijzingsReden["code"][] = [
    "onleesbaar_bestand",
    "werkblad_ontbreekt",
    "koprij_niet_herkend",
    "must_kolommen_ontbreken",
    "dubbele_kolomkop",
  ];
  expect([...gedekt].sort()).toEqual([...verwacht].sort());
  for (const reden of ALLE_REDENEN) {
    expect(afwijzingsTekst(reden).length, reden.code).toBeGreaterThan(20);
  }
});

test("elke waarschuwingscode heeft een niet-lege tekst", () => {
  const verwacht: RijWaarschuwing["code"][] = [
    "must_veld_leeg",
    "onbekende_artikelcode",
    "dubbele_artikelcode",
  ];
  expect(ALLE_WAARSCHUWINGEN.map((w) => w.code).sort()).toEqual([...verwacht].sort());
  for (const w of ALLE_WAARSCHUWINGEN) {
    expect(waarschuwingsTekst(w).length, w.code).toBeGreaterThan(10);
  }
});

test("de afwijzing bij ontbrekende must-kolommen noemt letterlijk wélke kolommen missen", () => {
  const tekst = afwijzingsTekst(ALLE_REDENEN[4]);
  expect(tekst).toContain("Category");
  expect(tekst).toContain("Product name (English)");
  expect(tekst).toContain("Nothing has been saved.");
});

test("de afwijzing bij een ontbrekend werkblad noemt de werkbladen die er wél zijn", () => {
  expect(afwijzingsTekst(ALLE_REDENEN[1])).toContain("Sheet1");
});

test("labels op een andere rij geven een andere boodschap dan 'verkeerd bestand'", () => {
  const verplaatst = afwijzingsTekst(ALLE_REDENEN[3]);
  expect(verplaatst).toContain("row 3");
  expect(verplaatst).not.toContain("not our format");
  expect(afwijzingsTekst(ALLE_REDENEN[2])).toContain("not our format");
});

test("de dubbele-kolomkop-afwijzing noemt Excel-kolomletters, niet kolomnummers", () => {
  const tekst = afwijzingsTekst(ALLE_REDENEN[5]);
  expect(tekst).toContain("J"); // kolom 10
  expect(tekst).toContain("AC"); // kolom 29
});

test("kolomLetter rekent 1-based kolomnummers om naar Excel-letters", () => {
  expect([1, 2, 26, 27, 28, 52, 53].map(kolomLetter)).toEqual([
    "A",
    "B",
    "Z",
    "AA",
    "AB",
    "AZ",
    "BA",
  ]);
});

test("de rij-waarschuwing noemt het Excel-rijnummer waar de mens naartoe moet", () => {
  expect(waarschuwingsTekst(ALLE_WAARSCHUWINGEN[0])).toContain("Row 4");
  expect(waarschuwingsTekst(ALLE_WAARSCHUWINGEN[2])).toContain("row 7");
});

test("een onbekende artikelcode wordt als vraag gesteld, niet als fout", () => {
  const tekst = waarschuwingsTekst(ALLE_WAARSCHUWINGEN[1]);
  expect(tekst).toContain("a new product?");
  expect(tekst.toLowerCase()).not.toContain("error");
});

test("geen waarschuwingen → een geruststellende samenvatting", () => {
  expect(samenvattingsTekst([], 12)).toContain("nothing to double-check");
  expect(samenvattingsTekst([], 0)).toContain("no product rows");
});

test("álles nieuw wordt samengevat als 'normaal bij een eerste levering', niet als 400 fouten", () => {
  // Dit is waarom de validator codes teruggeeft en geen zinnen: alleen een renderer die de
  // tellingen ziet, kan dit. In 4.B ziet een merk anders 400 rode regels.
  const w: RijWaarschuwing[] = Array.from({ length: 400 }, (_, i) => ({
    code: "onbekende_artikelcode",
    rij: i + 4,
    artikelcode: `A-${i}`,
  }));
  const tekst = samenvattingsTekst(w, 400);
  expect(tekst).toContain("all 400 products are new to us");
  expect(tekst).toContain("normal for a first delivery");
});

test("de samenvatting telt de soorten twijfel apart", () => {
  const tekst = samenvattingsTekst(ALLE_WAARSCHUWINGEN, 3);
  expect(tekst).toContain("1 empty required field(s)");
  expect(tekst).toContain("1 possibly new product(s)");
  expect(tekst).toContain("1 row(s) with a duplicate article code");
});
