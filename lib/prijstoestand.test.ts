// De leeskant van ijzeren regel 3 in zijn nieuwe formulering: welke zin komt er naast een
// vervallen product te staan? Puur, dus uitputtend te testen — en dat is hier de bedoeling,
// want deze teksten staan op een klantdocument (offerte + PDF) én op de zoekkaart.
import { expect, test } from "vitest";
import {
  isVervallen,
  leesPrijstoestand,
  vervalLabel,
  vervalMelding,
} from "@/lib/prijstoestand";

test("leesPrijstoestand accepteert de drie waarden en valt anders naar de veilige kant", () => {
  expect(leesPrijstoestand("actueel")).toBe("actueel");
  expect(leesPrijstoestand("prijslijst_verlopen")).toBe("prijslijst_verlopen");
  expect(leesPrijstoestand("uit_prijslijst")).toBe("uit_prijslijst");

  // ⚠️ De veilige kant is NIET 'actueel'. Een rij waarvan we de toestand niet kunnen lezen
  // mag geen bedrag rechtvaardigen — dat is regel 4 (default = veilig) toegepast op geld.
  for (const rommel of [null, undefined, "", "onbekend", "ACTUEEL", "verlopen"]) {
    expect(leesPrijstoestand(rommel)).toBe("uit_prijslijst");
  }
});

test("alleen 'actueel' is niet-vervallen", () => {
  expect(isVervallen("actueel")).toBe(false);
  expect(isVervallen("prijslijst_verlopen")).toBe(true);
  expect(isVervallen("uit_prijslijst")).toBe(true);
});

test("een actueel product levert geen melding en geen label — dan valt er niets te zeggen", () => {
  expect(
    vervalMelding("actueel", { name: "Price list 2026", validUntil: "2026-12-31" }),
  ).toBeNull();
  expect(vervalLabel("actueel")).toBeNull();
});

test("verlopen prijslijst: noemt het merk en de datum, en zegt dat er geen prijs is", () => {
  const zin = vervalMelding(
    "prijslijst_verlopen",
    { name: "Price list 2025", validUntil: "2025-12-31" },
    "Wever & Ducré",
  );
  expect(zin).toBe(
    "Price list of Wever & Ducré expired on 31-12-2025 — no current price.",
  );
});

test("verlopen prijslijst zonder merknaam blijft leesbaar", () => {
  expect(
    vervalMelding("prijslijst_verlopen", { name: null, validUntil: "2025-12-31" }, "  "),
  ).toBe("Price list of this brand expired on 31-12-2025 — no current price.");
});

test("uit de prijslijst gevallen: noemt de laatst bekende lijst, niet het merk", () => {
  // Het verschil met de melding hierboven is de hele reden dat de twee toestanden apart
  // gemodelleerd zijn: hier bel je niet om een verlenging, hier zoek je een vervanger.
  const zin = vervalMelding(
    "uit_prijslijst",
    { name: "Price list 2025", validUntil: "2025-12-31" },
    "Wever & Ducré",
  );
  expect(zin).toBe(
    "No longer included in the price list of 31-12-2025 (Price list 2025) — no current price.",
  );
});

test("ontbrekende historie: de zin zakt terug, hij verzint nooit een datum", () => {
  expect(vervalMelding("uit_prijslijst", { name: "Price list 2025", validUntil: null })).toBe(
    "No longer included in the current price list — no current price.",
  );
  expect(vervalMelding("uit_prijslijst", { name: null, validUntil: "2025-12-31" })).toBe(
    "No longer included in the price list of 31-12-2025 — no current price.",
  );
  expect(
    vervalMelding("prijslijst_verlopen", { name: null, validUntil: null }, "Flos"),
  ).toBe("Price list of Flos has expired — no current price.");
});

test("de korte labels zijn kort genoeg voor een badge en verschillen per toestand", () => {
  expect(vervalLabel("prijslijst_verlopen")).toBe("Price list expired");
  expect(vervalLabel("uit_prijslijst")).toBe("Discontinued");
});

test("geen enkele melding bevat een bedrag of een valutateken", () => {
  // De harde grens van regel 3: nooit een prijs uit een verlopen lijst. Er ís geen prop om
  // er een in te stoppen, en deze test bewaakt dat er ook nooit eentje in de tekst sluipt.
  const alle = [
    vervalMelding("prijslijst_verlopen", { name: "L", validUntil: "2025-01-01" }, "M"),
    vervalMelding("uit_prijslijst", { name: "L", validUntil: "2025-01-01" }, "M"),
  ].join(" ");
  expect(alle).not.toMatch(/[€$£]|\d+[.,]\d{2}\b/);
});
