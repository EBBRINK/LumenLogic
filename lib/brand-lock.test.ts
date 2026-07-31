// A14 (reviewzwerm 2.5a): de merkvergrendeling van ijzeren regel 4 vergeleek op
// deelstring. Deze tests leggen de operator vast — gelijkheid, niet 'bevat' — en de
// tegenproef dat de normalisatie legitieme schrijfwijze-varianten blijft accepteren.
import { expect, test } from "vitest";
import { brandLockMatches, normBrand } from "@/lib/brand-lock";

test("normBrand: hoofdletters, spaties, streepjes en punten tellen niet mee", () => {
  expect(normBrand("LEDS-C4")).toBe("ledsc4");
  expect(normBrand("LedsC4")).toBe("ledsc4");
  expect(normBrand("leds c4")).toBe("ledsc4");
  expect(normBrand("Delta Light")).toBe("deltalight");
  expect(normBrand(null)).toBe("");
  expect(normBrand(undefined)).toBe("");
});

// Dit is de zaak die de oude `.includes()`-implementatie zou hebben doorgelaten.
test("brandLockMatches: een moedermerk matcht zijn submerk NIET", () => {
  // De paren uit de bevinding, exact zoals ze in een ERP-merkentabel voorkomen.
  expect(brandLockMatches("Delta Light", "Delta")).toBe(false);
  expect(brandLockMatches("Thorn Lighting", "Thorn")).toBe(false);
  expect(brandLockMatches("Zumtobel Group", "Zumtobel")).toBe(false);
  // En andersom: het submerk vragen levert niet het moedermerk op.
  expect(brandLockMatches("Delta", "Delta Light")).toBe(false);
});

test("brandLockMatches: hetzelfde merk matcht, ook in een andere schrijfwijze", () => {
  expect(brandLockMatches("LedsC4", "LEDS-C4")).toBe(true);
  expect(brandLockMatches("XAL", "xal")).toBe(true);
  expect(brandLockMatches("Delta Light", "delta-light")).toBe(true);
  expect(brandLockMatches("Delta", "Delta")).toBe(true);
});

// Fail-closed: zonder gevraagd merk valt er niets te vergrendelen, en dan is het
// antwoord "nee" (default = veilig, ijzeren regel 4) — niet "alles mag".
test("brandLockMatches: leeg gevraagd merk is fail-closed", () => {
  expect(brandLockMatches("Delta", null)).toBe(false);
  expect(brandLockMatches("Delta", "")).toBe(false);
  expect(brandLockMatches("Delta", "   ")).toBe(false);
  expect(brandLockMatches(null, null)).toBe(false);
  // Een merkloos product haalt de vergrendeling dus ook nooit.
  expect(brandLockMatches(null, "Delta")).toBe(false);
});
