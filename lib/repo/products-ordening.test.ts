// De ordening van searchProducts, op een echte Postgres (PGlite) met de productie-migraties.
//
// WAAROM DIT BESTAAT. Twee sorteertermen in searchProducts zijn CONSTANTEN zodra er geen
// zoektokens zijn: `matchCount` (blijft `0` bij nul tokens — tokens zijn stukken van ≥2
// tekens) en `prefixBonus` (blijft `0` bij een lege zoektekst). Een kale integer in ORDER BY
// leest Postgres niet als waarde maar als KOLOMPOSITIE, en positie 0 bestaat niet:
//   ERROR: ORDER BY position 0 is not in select list
// Daarmee crashte /catalog op precies de twee invoeren hieronder — een merk zonder zoektekst
// en een zoektekst van één teken. Geen randgeval: het merk is op /catalog het startpunt.
//
// Het afvangpatroon staat al in lib/matching/engine.ts (rond regel 550): een constante
// sorteerterm wordt WEGGELATEN, niet vervangen. Deze twee tests pinnen dat hier vast.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import { searchProducts } from "@/lib/repo/products";

/** Eén merk met drie producten (plus een tweede merk, om te zien dat het filter werkt). */
async function seedCatalogus() {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
  });
  await addProductToBrand(db, { brandId, priceListId, name: "MENO 60 TRIMLESS" });
  await addProductToBrand(db, { brandId, priceListId, name: "SNOOT FOR SASSO 100" });
  await seedBrandProduct(db, { brand: "Prado", name: "SASSO LOOKALIKE" });
  return db;
}

test("merk zonder zoektekst geeft de producten van dat merk, op naam gesorteerd", async () => {
  const db = await seedCatalogus();
  const hits = await searchProducts(db, { query: "", brand: "XAL", limit: 20 });
  expect(hits.map((h) => h.name)).toEqual([
    "MENO 60 TRIMLESS",
    "SASSO 100 SQ SP CEIL 2700K",
    "SNOOT FOR SASSO 100",
  ]);
});

test("merk met een zoektekst van één teken crasht niet en filtert op die letter", async () => {
  const db = await seedCatalogus();
  // Eén teken levert nul tokens (drempel ≥2), dus `matchCount` blijft constant — de tak die
  // omviel. De naamfilter valt terug op `ilike '%M%'`: alleen MENO 60 TRIMLESS heeft een M.
  const hits = await searchProducts(db, { query: "M", brand: "XAL", limit: 20 });
  expect(hits.map((h) => h.name)).toEqual(["MENO 60 TRIMLESS"]);
});
