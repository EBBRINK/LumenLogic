// Merkportaal (H3) op een echte (PGlite) db. Bewijst de twee grenzen:
//   • H-11: elke upload landt op 'staging'; een prijslijst zonder valid_until wordt geweigerd.
//   • K-05: het dashboard leest de geaggregeerde materialized view (overwogen/gekozen),
//     na een expliciete refresh — de anonimiseringsgrens.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { logEvent } from "@/lib/repo/events";
import {
  getBrandAggregates,
  getBrandData,
  listBrandUploads,
  refreshBrandAggregates,
  submitBrandUpload,
} from "@/lib/repo/brand-portal";

test("H-11: een upload landt op status 'staging'", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });

  const row = await submitBrandUpload(db, {
    brandId,
    kind: "data",
    payload: { note: "nieuwe datasheet" },
    submittedBy: "merk@xal.com",
  });
  expect(row.status).toBe("staging");

  const uploads = await listBrandUploads(db, brandId);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].status).toBe("staging");
  expect(uploads[0].submittedBy).toBe("merk@xal.com");
});

test("een prijslijst-upload MET valid_until wordt als staging geaccepteerd", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Kreon", name: "ESPRIT" });

  const row = await submitBrandUpload(db, {
    brandId,
    kind: "pricelist",
    payload: { valid_until: "2027-12-31", lines: [] },
    submittedBy: "merk@kreon.com",
  });
  expect(row.status).toBe("staging");
  expect(row.kind).toBe("pricelist");
});

test("een prijslijst-upload ZONDER valid_until wordt geweigerd (ijzeren regel 3)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Glamox", name: "i40" });

  await expect(
    submitBrandUpload(db, {
      brandId,
      kind: "pricelist",
      payload: { lines: [] }, // geen valid_until
      submittedBy: "merk@glamox.com",
    }),
  ).rejects.toThrow(/valid_until/);

  // Niets gestaged: de weigering laat geen halve upload achter.
  expect(await listBrandUploads(db, brandId)).toHaveLength(0);
});

test("K-05: het dashboard toont geaggregeerde tellingen na een refresh", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
  });

  // Twee 'overwogen'-events en één 'gekozen'-event voor hetzelfde merk-product.
  await logEvent(db, {
    entity: "product",
    entityId: productId,
    action: "product_considered",
    payload: { productId },
  });
  await logEvent(db, {
    entity: "product",
    entityId: productId,
    action: "product_considered",
    payload: { productId },
  });
  await logEvent(db, {
    entity: "spec_line",
    entityId: productId,
    action: "spec_line_matched",
    payload: { productId },
  });

  // Vóór de refresh is de materialized view leeg — de refresh is de expliciete grens.
  expect(await getBrandAggregates(db)).toHaveLength(0);

  await refreshBrandAggregates(db);

  const aggregates = await getBrandAggregates(db);
  const xal = aggregates.find((a) => a.brandName === "XAL");
  expect(xal).toBeDefined();
  expect(xal?.considered).toBe(2);
  expect(xal?.chosen).toBe(1);

  // Voor de zekerheid: nog steeds geïsoleerde brandId nodig? getBrandData toont het merk.
  const data = await getBrandData(db, brandId);
  expect(data?.brand.name).toBe("XAL");
  expect(data?.products.map((p) => p.name)).toContain("SASSO 100");
});

test("getBrandData geeft null voor een onbekend merk", async () => {
  const db = await createTestDb();
  expect(await getBrandData(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
});
