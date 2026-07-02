// Matching-kwaliteit (frisse-ogen-review): het echte armatuur hoort boven zijn
// accessoires te staan, en de CSV-plak mag een meegeplakte kolomkop niet importeren.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { parseSpecCsv } from "@/lib/repo/dossiers";
import { searchProducts } from "@/lib/repo/products";

test("armatuur rankt boven accessoire dat de familienaam middenin noemt", async () => {
  const db = await createTestDb();
  // accessoire noemt "SASSO 100" middenin — matchte vroeger bovenaan door trigram-sim
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SNOOT LONG 100 FOR SASSO 100 / KARO 100",
    price: "16.00",
  });
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 17,9W cob LED 3000K 220-240V",
    price: "310.00",
  });

  const hits = await searchProducts(db, { query: "SASSO 100", brand: "XAL" });
  expect(hits.length).toBeGreaterThanOrEqual(2);
  // prefix-bonus: het armatuur (naam begint met de zoektekst) wint — óók al is het duurder,
  // want prijs zit nergens in de ordening (regel 2)
  expect(hits[0].name).toContain("SASSO 100 SQ SP CEIL");
  expect(hits[1].name).toContain("SNOOT");
});

test("CSV-plak slaat een meegeplakte kolomkop over", () => {
  const lines = parseSpecCsv(
    "code, aantal, merk, type\nLp301, 12, XAL, SASSO 100\nArmatuurcode; 1; x; y\nLw201, 8, Wever & Ducré, SCAVA 1.0",
  );
  expect(lines.map((l) => l.fixtureCode)).toEqual(["Lp301", "Lw201"]);
  expect(lines[0]).toMatchObject({ quantity: 12, brandText: "XAL", productText: "SASSO 100" });
});
