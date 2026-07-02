// PDF-armaturenboek-parser (run 2): segmenteert de doorlopende inhoudsopgave-tekst op
// armatuurcodes en splitst merk/type met de bekende-merkenlijst (multi-woord-merken heel).
import { expect, test } from "vitest";
import { parseTocText } from "./armaturenboek";

const BRANDS = ["XAL", "LED Linear", "iGuzzini", "NORKA", "Wever & Ducré"];

test("segmenteert één doorlopende tekststroom op armatuurcodes", () => {
  const text =
    "Armatuurcode Merk Type Bladzijde " +
    "Lp301 XAL SASSO 100 20 " +
    "Lr303 XAL SASSO 60 Adjustable 21 " +
    "Ls004 LED Linear XOOLINE 22 " +
    "Lw201 Wever & Ducré SCAVA 1.0 26";
  const lines = parseTocText(text, BRANDS);

  expect(lines.map((l) => l.fixtureCode)).toEqual([
    "Lp301", "Lr303", "Ls004", "Lw201",
  ]);
  // multi-woord-merk blijft heel; bladzijdenummer valt weg; "1.0" blijft in de type
  expect(lines[3]).toMatchObject({
    fixtureCode: "Lw201",
    brandText: "Wever & Ducré",
    productText: "SCAVA 1.0",
    quantity: 1,
  });
  expect(lines[1]).toMatchObject({ brandText: "XAL", productText: "SASSO 60 Adjustable" });
});

test("negeert kop-tekst vóór de eerste code en ontdubbelt codes", () => {
  const text = "RET Waalhaven Inhoudsopgave Lp301 XAL SASSO 100 20 Lp301 XAL SASSO 100 20";
  const lines = parseTocText(text, BRANDS);
  expect(lines).toHaveLength(1);
  expect(lines[0].fixtureCode).toBe("Lp301");
});
