// De twee kernregels uit BUILD-PLAN §6.3, bewezen op een echte (PGlite) database
// met exact dezelfde migraties/view als productie:
//   (a) een product met een verlopen prijslijst verschijnt in GÉÉN zoekresultaat;
//   (b) een dossier op `tender` levert nergens alternatieven-suggesties.
// Plus: de zichtbaarheidspoort en het event-log (regel 5).
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { recentEvents } from "@/lib/repo/events";
import {
  getAlternativeSuggestions,
  searchProducts,
} from "@/lib/repo/products";

test("regel 3: product met verlopen prijslijst is onzichtbaar in álle zoekresultaten", async () => {
  const db = await createTestDb();
  // geldig
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    validUntil: "2999-12-31",
  });
  // verlopen prijslijst → moet verdwijnen
  await seedBrandProduct(db, {
    brand: "GhostLux",
    name: "SASSO 100 PHANTOM EDITION",
    price: "999.00",
    validUntil: "2020-01-01",
  });

  const hits = await searchProducts(db, { query: "SASSO 100", limit: 20 });
  const names = hits.map((h) => h.name);
  expect(names).toContain("SASSO 100 SQ SP CEIL 2700K");
  // het verlopen product komt in geen enkel resultaat voor
  expect(names.some((n) => n.includes("PHANTOM"))).toBe(false);
  // ook niet bij een merk-brede zoekopdracht
  const byBrand = await searchProducts(db, {
    query: "PHANTOM",
    brand: "GhostLux",
    limit: 20,
  });
  expect(byBrand).toHaveLength(0);
});

test("regel 3: exacte SKU-match respecteert óók de zichtbaarheidspoort", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "GhostLux",
    name: "PHANTOM",
    articleCode: "L999-EXPIRED",
    validUntil: "2020-01-01",
  });
  const hits = await searchProducts(db, { query: "L999-EXPIRED" });
  expect(hits).toHaveLength(0); // verlopen → onvindbaar, ook op exact artikelnummer
});

test("regel 4: dossier op tender toont nergens alternatieven-suggesties", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
  });
  const tender = await getAlternativeSuggestions(db, {
    phase: "tender",
    productId,
  });
  expect(tender).toEqual([]); // default = veilig

  // de poort staat wél in de architectuur voor de gegund-stand (run 3-engine nog leeg)
  const awarded = await getAlternativeSuggestions(db, {
    phase: "awarded",
    productId,
  });
  expect(Array.isArray(awarded)).toBe(true);
});

test("regel 5: elke zoekactie wordt gelogd in de events-tabel", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  await searchProducts(db, { query: "SASSO", actor: "test@brink" });
  const evs = await recentEvents(db, 10);
  const search = evs.find((e) => e.action === "search");
  expect(search).toBeTruthy();
  expect(search?.actor).toBe("test@brink");
});
