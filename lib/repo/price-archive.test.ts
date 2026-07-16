// Prijslijst-vervanging + archief (plan-datamodel-productspecs, laag 3) op PGlite. Bewijst:
//   • archivePriceList verplaatst prijsregels naar archive.prices_archive (hot tabel leeg).
//   • replacePriceList archiveert de oude lijst en maakt de nieuwe actief — de partiële
//     unique (één ACTIEVE lijst per merk) staat twee lijsten toe zodra één vervangen is.
//   • Regel 3 blijft: na vervanging is het product via de nieuwe lijst weer zichtbaar.
//   • De unieke natuurlijke sleutel (brand_id, supplier_article_code) weigert duplicaten.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import {
  events,
  prices,
  pricesArchive,
  priceLists,
  products,
  visibleProducts,
} from "@/db/schema";
import {
  archivePriceList,
  replacePriceList,
  upsertPriceLines,
} from "@/lib/repo/price-archive";

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

// ── upsertPriceLines: regel-niveau bijwerking (sprint 1.2, plan besluit 1) ────

test("upsertPriceLines: gewijzigde regel archiveert de oude prijs en werkt bij", async () => {
  const db = await createTestDb();
  const { brandId, productId, priceListId } = await seedBrandProduct(db, {
    brand: "Flos Architectural",
    name: "Find me 0 spot",
    price: "196.00",
  });

  const res = await upsertPriceLines(
    db,
    brandId,
    [{ productId, grossPrice: "210.00" }],
    { actor: "test@brink" },
  );
  expect(res).toMatchObject({
    priceListId,
    inserted: 0,
    updated: 1,
    archivedLines: 1,
  });

  // Hot: de nieuwe prijs, op dezelfde (actieve) lijst — geen tweede lijst.
  const hot = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(hot).toHaveLength(1);
  expect(hot[0].grossPrice).toBe("210.00");
  expect(hot[0].priceListId).toBe(priceListId);

  // Koud: de oude prijs met de geldigheid van de LIJST waaronder hij gold.
  const cold = await db.select().from(pricesArchive);
  expect(cold).toHaveLength(1);
  expect(cold[0].grossPrice).toBe("196.00");
  expect(cold[0].validUntil).toBe("2999-12-31");
  expect(cold[0].archivedBy).toBe("test@brink");
});

test("upsertPriceLines: gelijke regel is een no-op — geen archiefrij (dit ís de idempotentie)", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
    price: "310.00",
  });

  // "310" i.p.v. "310.00": numeric(12,2) geeft "310.00" terug waar de diff "310" aanlevert.
  // Tekstvergelijking zou hier een archiefrij schrijven voor een prijs die niet veranderde.
  const res = await upsertPriceLines(db, brandId, [{ productId, grossPrice: "310" }], {});
  expect(res).toMatchObject({ inserted: 0, updated: 0, archivedLines: 0 });
  expect(await db.select().from(pricesArchive)).toHaveLength(0);
  const hot = await db.select().from(prices).where(eq(prices.productId, productId));
  expect(hot[0].grossPrice).toBe("310.00");
});

test("upsertPriceLines: geen actieve lijst + newList → lijst aangemaakt, regel ingevoegd", async () => {
  const db = await createTestDb();
  const { brandId, productId, priceListId } = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "Holon 40",
    price: "150.00",
  });
  // Merk zonder ACTIEVE lijst: de bestaande lijst archiveren maakt hem replaced.
  await archivePriceList(db, priceListId, "test@brink");

  const res = await upsertPriceLines(
    db,
    brandId,
    [{ productId, grossPrice: "160.00" }],
    {
      newList: { name: "Prijslijst 2027", validFrom: "2027-01-01", validUntil: "2027-12-31" },
      actor: "test@brink",
    },
  );
  expect(res.priceListId).not.toBe(priceListId);
  expect(res).toMatchObject({ inserted: 1, updated: 0, archivedLines: 0 });

  const lijsten = await db.select().from(priceLists).where(eq(priceLists.brandId, brandId));
  expect(lijsten.filter((l) => l.replacedAt === null)).toHaveLength(1);
  const acties = (await db.select().from(events)).map((e) => e.action);
  expect(acties).toContain("price_list_created");
});

test("upsertPriceLines: geen actieve lijst en geen newList → Error (nooit een datum verzinnen)", async () => {
  const db = await createTestDb();
  const { brandId, productId, priceListId } = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart Cake",
    price: "99.00",
  });
  await archivePriceList(db, priceListId);

  // valid_until drijft ijzeren regel 3: een gegokte einddatum maakt óf te vroeg alles
  // onzichtbaar óf houdt een verlopen lijst kunstmatig geldig.
  await expect(
    upsertPriceLines(db, brandId, [{ productId, grossPrice: "99.00" }], {}),
  ).rejects.toThrow(/no active price list/);
});

test("DE HAZARD-TEST: upsert van 1 van 3 producten laat de andere 2 zichtbaar — nooit replacePriceList", async () => {
  const db = await createTestDb();
  // Een merk met drie producten op één geldige lijst. Het merk stuurt een template terug met
  // maar één regel — een geldig bestand dat nooit beweerde volledig te zijn.
  const { brandId, priceListId, productId: eerste } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPY 39",
    price: "100.00",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });
  await addProductToBrand(db, { brandId, priceListId, name: "SPY 52", price: "120.00" });
  await addProductToBrand(db, { brandId, priceListId, name: "SPY 66", price: "140.00" });

  const voor = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(voor).toHaveLength(3);

  await upsertPriceLines(db, brandId, [{ productId: eerste, grossPrice: "110.00" }], {
    actor: "test@brink",
  });

  // Dít is de hazard: replacePriceList zou de andere twee prijsregels archiveren en die
  // producten via visible_products onzichtbaar maken (ijzeren regel 3) — schade uit een
  // bestand dat 1 van 3 producten bevatte.
  const na = await db
    .select()
    .from(visibleProducts)
    .where(eq(visibleProducts.brandId, brandId));
  expect(na, "de onaangeraakte producten mogen NOOIT uit visible_products vallen").toHaveLength(3);
  expect(na.find((p) => p.id === eerste)?.grossPrice).toBe("110.00");

  // En er is geen prijslijst gearchiveerd: op dit pad vuurt price_list_archived per definitie
  // nooit. Het analoge spoor is price_lines_upserted.archivedLines + de archiefrijen.
  const acties = (await db.select().from(events)).map((e) => e.action);
  expect(acties).not.toContain("price_list_archived");
  expect(acties).toContain("price_lines_upserted");
  expect(await db.select().from(pricesArchive)).toHaveLength(1);
  const [lijst] = await db.select().from(priceLists).where(eq(priceLists.id, priceListId));
  expect(lijst.replacedAt).toBeNull();
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
