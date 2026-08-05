// Staffelprijzen (I-05) op een echte (PGlite) db. Bewijst:
//   • 1–9 stuks = basisprijs, 10+ = staffelprijs, en de juiste drempel bij 10..24..25.
//   • setPriceTier is idempotent op (product, prijslijst, min_qty).
//   • Regel 3: verlopen prijslijst → geen prijs, ook niet via een staffel.
//   • Regel 3: een staffel uit een VERLOPEN lijst lekt niet in de geldige lijst.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { priceLists, prices, visibleProducts } from "@/db/schema";
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

// Regel 3, de scherpe variant: het product HEEFT een geldige prijs (lijst B), maar de
// oude staffel hangt aan de verlopen lijst A. Die staffel mag niet meeliften op de
// geldige basisprijs — anders offreer je €250 uit een lijst die niet meer geldt.
// Dit is precies de binding `price_tiers.price_list_id = visible_products.price_list_id`
// in getPriceForQty; zonder die regel wint hier de staffel van de verlopen lijst.
test("regel 3: een staffel uit een verlopen prijslijst telt niet mee bij de geldige basisprijs", async () => {
  const db = await createTestDb();

  // Lijst A — de oude lijst: verlopen (valid_until in het verleden) én dus onzichtbaar
  // in visible_products. Draagt de scherpe staffel van vroeger: 10+ → €250.
  const { brandId, productId, priceListId: listA } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 CEIL",
    price: "300.00",
    validFrom: "2020-01-01",
    validUntil: "2024-12-31", // verlopen → lijst A staat niet in visible_products
  });
  await setPriceTier(db, {
    productId,
    priceListId: listA,
    minQty: 10,
    grossPrice: "250.00",
  });

  // Lijst A als vervangen markeren. Nodig omdat `price_lists_brand_active_uniq` maar
  // één ACTIEVE lijst (replaced_at IS NULL) per merk toestaat; de zichtbaarheids-hefboom
  // blijft de vervaldatum — visible_products kijkt uitsluitend naar valid_from/valid_until.
  await db
    .update(priceLists)
    .set({ replacedAt: new Date() })
    .where(eq(priceLists.id, listA));

  // Lijst B — de huidige lijst van hetzelfde merk: geldig, en zónder staffel.
  const [listB] = await db
    .insert(priceLists)
    .values({
      brandId,
      name: "Prijslijst XAL 2026",
      validFrom: "2020-01-01",
      validUntil: "2999-12-31",
    })
    .returning();
  // Zelfde product, nieuwe (hogere) basisprijs in lijst B.
  await db
    .insert(prices)
    .values({ productId, priceListId: listB.id, grossPrice: "400.00" });

  // Controle op de fixture: het product heeft precies één zichtbare prijs — die van
  // lijst B. Zonder deze check zou een tweede zichtbare rij het bewijs vertroebelen.
  const zichtbaar = await db
    .select({ priceListId: visibleProducts.priceListId, grossPrice: visibleProducts.grossPrice })
    .from(visibleProducts)
    .where(eq(visibleProducts.id, productId));
  expect(zichtbaar).toEqual([{ priceListId: listB.id, grossPrice: "400.00" }]);

  // 20 stuks: de drempel 10 bestaat wél, maar alleen in de verlopen lijst A → negeren.
  // Verwacht de basisprijs uit lijst B, niet de €250 uit de verlopen lijst.
  const q20 = await getPriceForQty(db, productId, 20);
  expect(q20).toEqual({ unitPrice: "400.00", minQty: null, source: "basis" });
});
