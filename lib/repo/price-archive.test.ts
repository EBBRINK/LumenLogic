// Prijslijst-vervanging + archief (plan-datamodel-productspecs, laag 3) op PGlite. Bewijst:
//   • archivePriceList verplaatst prijsregels naar archive.prices_archive (hot tabel leeg).
//   • replacePriceList archiveert de oude lijst en maakt de nieuwe actief — de partiële
//     unique (één ACTIEVE lijst per merk) staat twee lijsten toe zodra één vervangen is.
//   • Regel 3 blijft: na vervanging is het product via de nieuwe lijst weer zichtbaar.
//   • De unieke natuurlijke sleutel (brand_id, supplier_article_code) weigert duplicaten.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { prices, pricesArchive, priceLists, products } from "@/db/schema";
import { archivePriceList, replacePriceList } from "@/lib/repo/price-archive";

test("archivePriceList: prijsregels verhuizen naar het archief, lijst wordt vervangen-gemarkeerd", async () => {
  const db = await createTestDb();
  const { priceListId, productId, brandId } = await seedBrandProduct(db, {
    brand: "Flos Architectural",
    name: "Find me 0 spot",
    price: "196.00",
  });

  const { archivedCount } = await archivePriceList(db, priceListId, "test@brink");
  expect(archivedCount).toBe(1);

  // hot tabel leeg, archief gevuld met herkomst-metadata
  const hot = await db.select().from(prices).where(eq(prices.priceListId, priceListId));
  expect(hot).toHaveLength(0);
  const cold = await db.select().from(pricesArchive);
  expect(cold).toHaveLength(1);
  expect(cold[0].productId).toBe(productId);
  expect(cold[0].brandId).toBe(brandId);
  expect(cold[0].grossPrice).toBe("196.00");
  expect(cold[0].archivedBy).toBe("test@brink");

  // lijst-metadata blijft (offertes verwijzen ernaar), maar is niet meer actief
  const [list] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(list.replacedAt).not.toBeNull();
});

test("replacePriceList: oude lijst → archief, nieuwe lijst actief; twee lijsten per merk mag nu", async () => {
  const db = await createTestDb();
  const { priceListId: oldList, productId, brandId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
    price: "310.00",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  });

  const { priceListId: newList, archivedCount } = await replacePriceList(
    db,
    brandId,
    { name: "Prijslijst 2027", validFrom: "2027-01-01", validUntil: "2027-12-31" },
    "test@brink",
  );
  expect(archivedCount).toBe(1);
  expect(newList).not.toBe(oldList);

  // beide lijst-rijen bestaan; alleen de nieuwe is actief
  const lists = await db.select().from(priceLists).where(eq(priceLists.brandId, brandId));
  expect(lists).toHaveLength(2);
  expect(lists.find((l) => l.id === oldList)?.replacedAt).not.toBeNull();
  expect(lists.find((l) => l.id === newList)?.replacedAt).toBeNull();

  // nieuwe prijs opvoeren voor hetzelfde product → weer precies één hot prijsregel
  await db.insert(prices).values({ productId, priceListId: newList, grossPrice: "325.00" });
  const hot = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(hot).toHaveLength(1);
  expect(hot[0].grossPrice).toBe("325.00");
});

test("natuurlijke sleutel: zelfde (brand, supplier_article_code) twee keer → geweigerd", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "Holon 40",
    supplierArticleCode: "K-40-001",
  });
  await expect(
    db.insert(products).values({
      id: crypto.randomUUID(),
      name: "Holon 40 (duplicaat)",
      brandId,
      brandName: "Kreon",
      supplierArticleCode: "K-40-001",
    }),
  ).rejects.toThrow();
});
