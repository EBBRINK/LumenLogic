// XIS-export (E-09…E-12): het exportbestand is de bewijslast dat de calculator een
// aanvraag compleet en in de juiste volgorde doorgeeft. De harde regels die hier getest
// worden: aanvraagvolgorde (sort_order, nooit hersorteren op status/prijs), correcte
// classificatie, idempotentie op dossier-id, en NIETS wordt stilzwijgend weggelaten.
import { expect, test } from "vitest";
import { asc, eq } from "drizzle-orm";
import { projectDossiers, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import {
  buildXisPayload,
  createXisExport,
  getXisExports,
  preflightSummary,
} from "./xis";

// Zet een dossier klaar met alle vijf de statussen + een handmatig product (nieuw_product).
// De sort_order-volgorde is bewust NIET gelijk aan prijs- of statusgroepering, zodat de
// test aantoont dat er op sort_order en niets anders gesorteerd wordt.
async function seedDossier(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();

  // Producten in de catalogus (zichtbaar → geldige prijslijst uit seedBrandProduct-default).
  const p1 = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    articleCode: "L360-SASSO100",
  });
  const p2 = await seedBrandProduct(db, {
    brand: "Wever & Ducré",
    name: "SCAVA WALL SURF 1.0 3000K",
    price: "226.00",
    articleCode: "L092-SCAVA",
  });
  // handmatig opgevoerd product: gematcht maar ZONDER artikelcode → nieuw_product
  const p3 = await seedBrandProduct(db, {
    brand: "Modular",
    name: "Handmatig armatuur X",
    price: "88.00",
    // articleCode default null
  });

  // Regels in gescrambelde insert-volgorde; sort_order bepaalt de aanvraagvolgorde 0..5.
  const rows = [
    { fixtureCode: "Ln601", status: "groen", matchedProductId: p3.productId, sortOrder: 5, brandText: "Modular", productText: "custom", manualPrice: null },
    { fixtureCode: "Lx501", status: "paars", matchedProductId: null, sortOrder: 4, brandText: null, productText: "bureaustoel", manualPrice: null },
    { fixtureCode: "Lp301", status: "groen", matchedProductId: p1.productId, sortOrder: 0, brandText: "XAL", productText: "SASSO 100", manualPrice: null },
    { fixtureCode: "Lr401", status: "rood", matchedProductId: null, sortOrder: 3, brandText: "XAL", productText: "onvindbaar type", manualPrice: null },
    { fixtureCode: "Lw201", status: "geel", matchedProductId: p2.productId, sortOrder: 1, brandText: "Wever & Ducré", productText: "SCAVA 1.0", manualPrice: "199.00" },
    { fixtureCode: "Lb101", status: "blauw", matchedProductId: null, sortOrder: 2, brandText: "Onbekendmerk", productText: "iets", manualPrice: null },
  ] as const;

  for (const r of rows) {
    await db.insert(specLines).values({
      dossierId: dossier.id,
      fixtureCode: r.fixtureCode,
      status: r.status,
      matchedProductId: r.matchedProductId,
      brandText: r.brandText,
      productText: r.productText,
      quantity: 4,
      manualPrice: r.manualPrice,
      sortOrder: r.sortOrder,
    });
  }
  return dossier.id;
}

test("payload: alle regels in aanvraagvolgorde, niets weggelaten", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);

  const payload = await buildXisPayload(db, dossierId);

  // (a) alle 6 regels komen mee (niets stilzwijgend weggelaten)
  expect(payload.lines).toHaveLength(6);
  // (d) precies op sort_order 0..5 — nooit hersorteren op status of prijs
  expect(payload.lines.map((l) => l.sort_order)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(payload.lines.map((l) => l.fixture_code)).toEqual([
    "Lp301", // 0 groen
    "Lw201", // 1 geel
    "Lb101", // 2 blauw
    "Lr401", // 3 rood
    "Lx501", // 4 paars
    "Ln601", // 5 groen (nieuw_product)
  ]);

  // kopblok: dossier-id is de idempotentiesleutel
  expect(payload.project.external_reference).toBe(dossierId);
  expect(payload.project.name).toBe("Ziekenhuis Noord");
  expect(payload.project.customer).toBe("Deerns");
});

test("classificatie: product / tekstregel / nieuw_product", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);

  const { lines } = await buildXisPayload(db, dossierId);
  const byCode = Object.fromEntries(lines.map((l) => [l.fixture_code, l]));

  // (b) groen/geel met artikelcode → product, mét sku/naam/stukprijs
  expect(byCode["Lp301"].kind).toBe("product");
  expect(byCode["Lp301"].product_ref).toBe("L360-SASSO100");
  expect(byCode["Lp301"].product_name).toBe("SASSO 100 SQ SP CEIL 2700K");
  expect(byCode["Lp301"].unit_price_excl_vat).toBe(310);

  expect(byCode["Lw201"].kind).toBe("product");
  expect(byCode["Lw201"].product_ref).toBe("L092-SCAVA");
  // I-04: manualPrice (dagprijs) wint van de catalogusprijs
  expect(byCode["Lw201"].unit_price_excl_vat).toBe(199);

  // blauw/rood/paars → tekstregel: gaat mee ZONDER artikel/prijs
  for (const code of ["Lb101", "Lr401", "Lx501"]) {
    expect(byCode[code].kind).toBe("tekstregel");
    expect(byCode[code].product_ref).toBeNull();
    expect(byCode[code].product_name).toBeNull();
    expect(byCode[code].unit_price_excl_vat).toBeNull();
  }

  // gematcht maar zonder artikelcode → nieuw_product: wél naam/prijs, geen product_ref
  expect(byCode["Ln601"].kind).toBe("nieuw_product");
  expect(byCode["Ln601"].product_ref).toBeNull();
  expect(byCode["Ln601"].product_name).toBe("Handmatig armatuur X");
  expect(byCode["Ln601"].unit_price_excl_vat).toBe(88);
});

test("pre-flight-telling klopt", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);

  const summary = await preflightSummary(db, dossierId);
  expect(summary).toEqual({
    productLines: 2,
    textLines: 3,
    newProducts: 1,
    total: 6,
  });
});

test("idempotent op dossier-id: 2× createXisExport → 1 rij, created:false de 2e keer", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);

  const first = await createXisExport(db, { dossierId, actor: "timo" });
  expect(first.created).toBe(true);
  expect(first.export.mode).toBe("file");
  expect(first.export.environment).toBe("sandbox"); // NFR 7: sandbox default
  expect(first.export.status).toBe("aangemaakt");

  const second = await createXisExport(db, { dossierId, actor: "timo" });
  expect(second.created).toBe(false);
  expect(second.export.id).toBe(first.export.id);

  const all = await getXisExports(db, dossierId);
  expect(all).toHaveLength(1);

  // de weggeschreven snapshot bevat alle 6 regels (niets weggelaten bij export)
  const snapshot = all[0].payload as { lines: unknown[] };
  expect(snapshot.lines).toHaveLength(6);
});

test("environment override wordt gerespecteerd", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);
  const { export: exp } = await createXisExport(db, {
    dossierId,
    environment: "production",
  });
  expect(exp.environment).toBe("production");
});
