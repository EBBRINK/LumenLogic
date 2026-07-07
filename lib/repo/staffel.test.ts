// Staffelprijzen (I-05) op een echte (PGlite) db. Bewijst:
//   • 1–9 stuks = basisprijs, 10+ = staffelprijs, en de juiste drempel bij 10..24..25.
//   • setPriceTier is idempotent op (product, prijslijst, min_qty).
//   • Regel 3: verlopen prijslijst → geen prijs, ook niet via een staffel.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { getPriceForQty, listTiers, setPriceTier } from "@/lib/repo/staffel";

test("1–9 stuks = basisprijs, 10+ = staffelprijs (juiste drempel)", async () => {
  const db = await createTestDb();
  const { productId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 CEIL",
    price: "310.00",
  });
  await setPriceTier(db, { productId, priceListId, minQty: 10, grossPrice: "280.00" });
  await setPriceTier(db, { productId, priceListId, minQty: 25, grossPrice: "250.00" });

  // 5 stuks: geen drempel ≤ 5 → basisprijs.
  const q5 = await getPriceForQty(db, productId, 5);
  expect(q5).toEqual({ unitPrice: "310.00", minQty: null, source: "basis" });

  // 10 stuks: eerste drempel raakt.
  const q10 = await getPriceForQty(db, productId, 10);
  expect(q10.source).toBe("staffel");
  expect(q10.minQty).toBe(10);
  expect(q10.unitPrice).toBe("280.00");

  // 24 stuks: hoogste drempel ≤ 24 is nog steeds 10.
  const q24 = await getPriceForQty(db, productId, 24);
  expect(q24.minQty).toBe(10);
  expect(q24.unitPrice).toBe("280.00");

  // 25 stuks: de hogere drempel wint.
  const q25 = await getPriceForQty(db, productId, 25);
  expect(q25.minQty).toBe(25);
  expect(q25.unitPrice).toBe("250.00");
});

test("ontbrekend/0 aantal valt terug op de basisprijs (stukprijs-modus)", async () => {
  const db = await createTestDb();
  const { productId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "X",
    price: "100.00",
  });
  await setPriceTier(db, { productId, priceListId, minQty: 10, grossPrice: "80.00" });
  const res = await getPriceForQty(db, productId, null);
  expect(res.source).toBe("basis");
  expect(res.unitPrice).toBe("100.00");
});

test("setPriceTier is idempotent op (product, lijst, min_qty); listTiers sorteert oplopend", async () => {
  const db = await createTestDb();
  const { productId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "X",
    price: "100.00",
  });
  await setPriceTier(db, { productId, priceListId, minQty: 25, grossPrice: "70.00" });
  await setPriceTier(db, { productId, priceListId, minQty: 10, grossPrice: "80.00" });
  // Zelfde drempel opnieuw → prijs bijwerken, geen tweede rij.
  await setPriceTier(db, { productId, priceListId, minQty: 10, grossPrice: "75.00" });

  const tiers = await listTiers(db, productId);
  expect(tiers.map((t) => t.minQty)).toEqual([10, 25]);
  expect(tiers.find((t) => t.minQty === 10)?.grossPrice).toBe("75.00");
});

test("regel 3: verlopen prijslijst → geen prijs, ook niet via de staffel", async () => {
  const db = await createTestDb();
  const { productId, priceListId } = await seedBrandProduct(db, {
    brand: "Ghost",
    name: "PHANTOM",
    price: "100.00",
    validUntil: "2020-01-01", // verlopen → onzichtbaar in visible_products
  });
  await setPriceTier(db, { productId, priceListId, minQty: 10, grossPrice: "80.00" });
  const res = await getPriceForQty(db, productId, 50);
  expect(res).toEqual({ unitPrice: null, minQty: null, source: null });
});
