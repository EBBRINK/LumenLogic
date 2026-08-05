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
  resolveBrandFromParam,
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

// ── resolveBrandFromParam: ?brand= mag de cast niet laten klappen ─────────────
//
// Dit is blocker 2 uit de UX-audit (30 jul, bug #1), hier op een ECHTE Postgres
// (PGlite) in plaats van via een broncontrole: zonder de isUuid-guard doet
// `eq(brands.id, "nope")` een cast naar uuid en gooit Postgres `invalid input syntax
// for type uuid`. Die fout kwam nergens tot stilstand, dus /brand/data?brand=nope,
// /brand/dashboard?brand=nope en /brand/price-lists?brand=nope gaven een 500 — drie
// van de vier kopieën van deze resolver misten de guard.

test("?brand=<kapot> valt terug op het eerste merk in plaats van te klappen", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "Aaltos", name: "A1" });
  await seedBrandProduct(db, { brand: "Zumtobel", name: "Z1" });

  // Zónder guard gooit deze regel; mét guard is het gewoon de terugval.
  for (const kapot of ["nope", "", "-".repeat(36), "../../etc/passwd", "%20"]) {
    const brand = await resolveBrandFromParam(db, kapot);
    expect(brand?.name, kapot).toBe("Aaltos"); // eerste op naam
  }
});

test("?brand=<geldige uuid zonder rij> geeft dezelfde terugval, niet strenger", async () => {
  // De kern van de keuze: een kapotte queryparam hoort niet strenger behandeld te
  // worden dan een geldige die niets vindt. Beide → eerste merk, geen notFound().
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "Aaltos", name: "A1" });

  const onbekend = await resolveBrandFromParam(
    db,
    "00000000-0000-0000-0000-000000000000",
  );
  expect(onbekend?.name).toBe("Aaltos");
  expect((await resolveBrandFromParam(db, "nope"))?.name).toBe("Aaltos");
});

test("?brand=<bestaand merk> wint gewoon van de terugval", async () => {
  // Anders zou de guard onopgemerkt álles naar het eerste merk kunnen sturen.
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "Aaltos", name: "A1" });
  const { brandId } = await seedBrandProduct(db, { brand: "Zumtobel", name: "Z1" });

  expect((await resolveBrandFromParam(db, brandId))?.name).toBe("Zumtobel");
});

test("zonder merken in de database is het antwoord null, geen fout", async () => {
  const db = await createTestDb();
  expect(await resolveBrandFromParam(db, "nope")).toBeNull();
  expect(await resolveBrandFromParam(db, undefined)).toBeNull();
});
