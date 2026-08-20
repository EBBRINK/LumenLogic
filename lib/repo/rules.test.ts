// De twee kernregels uit BUILD-PLAN §6.3, bewezen op een echte (PGlite) database
// met exact dezelfde migraties/view als productie:
//   (a) een product met een verlopen prijslijst is VINDBAAR maar zonder bedrag;
//   (b) een dossier op `tender` levert nergens alternatieven-suggesties.
// Plus: de zichtbaarheidspoort en het event-log (regel 5).
//
// ⚠️ (a) is op 19 aug 2026 omgekeerd. Regel 3 luidde "verlopen prijslijst = onzichtbaar in
// álle zoekresultaten" en luidt nu "verlopen prijslijst = zichtbaar zonder prijs, rood, mét
// de laatst bekende lijst". De BESCHERMING is onveranderd — er mag nog steeds nooit een
// bedrag uit een verlopen lijst getoond worden — maar verbergen heeft plaatsgemaakt voor
// melden. Aanleiding: bestekschrijvers typen artikelnummers over uit een bestek van vorig
// jaar; die kregen nul treffers in plaats van "dit product is vervallen". Zie
// docs/probleem-vervallen-producten.md. De tests hieronder bewaken beide helften: vindbaar
// JA, bedrag NEE.
import { expect, test } from "vitest";
import {
  createTestDb,
  laatProductUitPrijslijstVallen,
  seedBrandProduct,
} from "@/db/test-db";
import { recentEvents } from "@/lib/repo/events";
import {
  getAlternativeSuggestions,
  searchProducts,
} from "@/lib/repo/products";

test("regel 3: product met verlopen prijslijst is vindbaar, maar zonder bedrag", async () => {
  const db = await createTestDb();
  // geldig
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    validUntil: "2999-12-31",
  });
  // verlopen prijslijst → blijft staan, maar prijsloos en gemarkeerd
  await seedBrandProduct(db, {
    brand: "GhostLux",
    name: "SASSO 100 PHANTOM EDITION",
    price: "999.00",
    validFrom: "2019-01-01",
    validUntil: "2020-01-01",
  });

  const hits = await searchProducts(db, { query: "SASSO 100", limit: 20 });
  const namen = hits.map((h) => h.name);
  expect(namen).toContain("SASSO 100 SQ SP CEIL 2700K");
  // ⚠️ De omkering: het verlopen product KOMT in het resultaat.
  expect(namen).toContain("SASSO 100 PHANTOM EDITION");

  const geldig = hits.find((h) => h.name.includes("SQ SP CEIL"))!;
  expect(geldig.priceState).toBe("actueel");
  expect(geldig.grossPrice).toBe("310.00");

  const verlopen = hits.find((h) => h.name.includes("PHANTOM"))!;
  expect(verlopen.priceState).toBe("prijslijst_verlopen");
  // De bescherming, ongewijzigd: geen bedrag, geen valuta, geen prijslijst om aan te haken.
  expect(verlopen.grossPrice).toBeNull();
  expect(verlopen.currency).toBeNull();
  // Wél de laatst bekende lijst — dat is de hele melding: "laatste prijslijst was die en die".
  expect(verlopen.lastPriceListValidUntil).toBe("2020-01-01");
  expect(verlopen.lastPriceListName).toBe("Prijslijst GhostLux");

  // Ook bij een merk-brede zoekopdracht: het merk is niet weggevaagd.
  const perMerk = await searchProducts(db, {
    query: "PHANTOM",
    brand: "GhostLux",
    limit: 20,
  });
  expect(perMerk).toHaveLength(1);
  expect(perMerk[0].grossPrice).toBeNull();
});

test("regel 3: exacte SKU-match vindt het vervallen product — dát was het hele probleem", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "GhostLux",
    name: "PHANTOM",
    articleCode: "L999-EXPIRED",
    validFrom: "2019-01-01",
    validUntil: "2020-01-01",
  });
  // De bestekschrijver typt het artikelnummer over uit het bestek van vorig jaar.
  const hits = await searchProducts(db, { query: "L999-EXPIRED" });
  expect(hits).toHaveLength(1);
  expect(hits[0].matchKind).toBe("exact");
  expect(hits[0].priceState).toBe("prijslijst_verlopen");
  expect(hits[0].grossPrice).toBeNull();
});

test("regel 3: uit de nieuwe prijslijst gevallen is een ándere toestand dan een verlopen lijst", async () => {
  const db = await createTestDb();
  // Lijst is gewoon geldig; dit ene product staat er niet meer in.
  const { productId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "BOXY DISCONTINUED",
    articleCode: "DL-OUT-1",
    price: "88.00",
    validUntil: "2999-12-31",
  });
  const gearchiveerd = await laatProductUitPrijslijstVallen(db, productId);

  const hits = await searchProducts(db, { query: "DL-OUT-1" });
  expect(hits).toHaveLength(1);
  // Niet 'prijslijst_verlopen': de lijst mankeert niets, het product is uit productie.
  expect(hits[0].priceState).toBe("uit_prijslijst");
  expect(hits[0].grossPrice).toBeNull();
  expect(hits[0].lastPriceListName).toBe(gearchiveerd.priceListName);
  expect(hits[0].lastPriceListValidUntil).toBe(gearchiveerd.validUntil);
});

test("regel 3: een product waarvan we NOOIT een prijs kenden blijft onzichtbaar", async () => {
  // De grens aan de andere kant. "Zichtbaar" betekent sinds 0022 "wij kennen de prijs, of
  // kenden hem" — zonder deze grens zouden 200k+ nooit-geprijsde rijen de catalogus
  // overspoelen, en de negatieve controle van het testmerk zou zijn betekenis verliezen.
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Halfvol",
    name: "MET PRIJS",
    articleCode: "HV-1",
    validUntil: "2999-12-31",
  });
  const { addProductToBrand } = await import("@/db/test-db");
  const { productId } = await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "ZONDER PRIJS",
    articleCode: "HV-2",
  });
  // Prijsregel er weer uit halen zonder te archiveren = nooit geprijsd.
  const { prices } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(prices).where(eq(prices.productId, productId));

  expect(await searchProducts(db, { query: "HV-1" })).toHaveLength(1);
  expect(await searchProducts(db, { query: "HV-2" })).toHaveLength(0);
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
