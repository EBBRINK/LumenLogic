// Het resultaatplafond van /catalog, op een echte Postgres (PGlite) met de productie-
// migraties. Besloten in de demosessie met Brink Licht (12 aug): een vage zoekopdracht gaf
// honderden technisch kloppende maar waardeloze treffers. Er worden er nu maximaal negen
// getoond — mét het werkelijke totaal ernaast.
//
// Waar het hier om draait: dat totaal moet exact de rijen tellen die de query ook zou
// teruggeven. Twee manieren waarop dat stuk kan:
//   • de teller telt langs de zichtbaarheidspoort heen (ijzeren regel 3 — een verlopen
//     prijslijst maakt een product onzichtbaar in álle zoekresultaten);
//   • de teller telt vóór een filter dat pas later toeslaat, zodat "9 of 237" een getal
//     noemt waar de gebruiker nooit bij kan komen.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import { searchProductsWithTotal } from "@/lib/repo/products";

/** Eén merk met `n` producten met dezelfde naamfamilie. */
async function seedFamilie(n: number) {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 VARIANT 01",
    kelvin: 3000,
  });
  for (let i = 2; i <= n; i++) {
    await addProductToBrand(db, {
      brandId,
      priceListId,
      name: `SASSO 100 VARIANT ${String(i).padStart(2, "0")}`,
      kelvin: 3000,
    });
  }
  return db;
}

test("plafond: er komen nooit meer treffers terug dan het gevraagde maximum", async () => {
  const db = await seedFamilie(12);
  const { items, total } = await searchProductsWithTotal(db, {
    query: "SASSO 100",
    limit: 9,
  });
  expect(items).toHaveLength(9);
  // ...maar het totaal noemt de hele stapel, óók wat buiten beeld bleef.
  expect(total).toBe(12);
});

test("teller: het totaal is het aantal ZICHTBARE treffers (ijzeren regel 3)", async () => {
  const db = await seedFamilie(3);
  // Regel 3, herschreven 19 aug 2026: een verlopen prijslijst maakt het product niet meer
  // onzichtbaar, maar prijsloos. Het telt dus mee in het totaal — mét de markering, zónder
  // bedrag. De teller en de lijst moeten hetzelfde universum zien.
  await seedBrandProduct(db, {
    brand: "GhostLux",
    name: "SASSO 100 PHANTOM EDITION",
    validUntil: "2020-01-01",
  });
  const { items, total } = await searchProductsWithTotal(db, {
    query: "SASSO 100",
    limit: 9,
  });
  expect(total).toBe(4);
  const phantom = items.find((i) => i.name.includes("PHANTOM"));
  expect(phantom).toBeDefined();
  expect(phantom?.grossPrice).toBeNull();
});

test("teller: een specfilter telt in dezelfde adem als het filtert", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 WARM",
    kelvin: 3000,
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 KOEL",
    kelvin: 4000, // aantoonbaar niet gevraagd → weg uit lijst én uit teller
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 ONBEKEND",
    kelvin: null, // ontbrekende data is geen afkeuring → blijft, en telt mee
  });

  const { items, total } = await searchProductsWithTotal(db, {
    query: "SASSO 100",
    limit: 9,
    filters: { kelvin: 3000 },
  });
  const namen = items.map((i) => i.name).sort();
  expect(namen).toEqual(["SASSO 100 ONBEKEND", "SASSO 100 WARM"]);
  expect(total).toBe(2);
});

test("teller: IP-ondergrens leest hetzelfde getal als het scherm", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 BUITEN",
    ip: "IP65",
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 BINNEN",
    ip: "IP20", // aantoonbaar te laag
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 GEEN IP",
    ip: null, // onbekend ≠ afgekeurd
  });

  const { items, total } = await searchProductsWithTotal(db, {
    query: "SASSO 100",
    limit: 9,
    filters: { ip: 44 },
  });
  expect(items.map((i) => i.name).sort()).toEqual([
    "SASSO 100 BUITEN",
    "SASSO 100 GEEN IP",
  ]);
  expect(total).toBe(2);
});

test("teller: onder het plafond is het totaal gewoon het aantal getoonde treffers", async () => {
  const db = await seedFamilie(4);
  const { items, total } = await searchProductsWithTotal(db, {
    query: "SASSO 100",
    limit: 9,
  });
  expect(items).toHaveLength(4);
  expect(total).toBe(4);
});
