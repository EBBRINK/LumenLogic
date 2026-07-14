// Merkrelaties-repo (stap 2): reads schrijven nooit (virtueel 'niet_benaderd'),
// upsert is de enige schrijver en logt precies de juiste events (regel 5), en de
// prijslijst-indicator deelt de datumlogica met listPriceListStatus.
import { expect, test } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { brandRelations, brands, events } from "@/db/schema";
import {
  getAllBrandCompleteness,
  getBrandCompleteness,
  listBrandRelations,
  priceListIndicator,
  upsertBrandRelation,
  PRICE_FIELD_KEY,
} from "@/lib/repo/brand-relations";

const TODAY = new Date("2026-07-14T12:00:00Z");

async function eventsFor(db: Awaited<ReturnType<typeof createTestDb>>, brandId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.entityId, brandId))
    .orderBy(asc(events.createdAt));
}

test("lezen zonder rij → virtueel 'niet_benaderd', en lezen schrijft NOOIT", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Flos", name: "Aim" });

  const rows = await listBrandRelations(db, TODAY);
  const flos = rows.find((r) => r.brandId === brandId)!;
  expect(flos.status).toBe("niet_benaderd");
  expect(flos.productCount).toBe(1);

  // Geen rij ontstaan door het lezen (K2: reads zijn puur virtueel).
  expect(await db.select().from(brandRelations)).toHaveLength(0);
  expect(await eventsFor(db, brandId)).toHaveLength(0);
});

test("upsert-round-trip: insert → update op dezelfde rij (on conflict)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Artemide", name: "Tolomeo" });

  await upsertBrandRelation(db, brandId, {
    status: "benaderd",
    contactName: "Anna",
    contactEmail: "anna@artemide.it",
    lastContactAt: "2026-07-10",
  }, "timo");
  await upsertBrandRelation(db, brandId, { status: "wacht_op_data" }, "timo");

  const all = await db.select().from(brandRelations);
  expect(all).toHaveLength(1); // upsert, geen tweede rij
  expect(all[0].status).toBe("wacht_op_data");
  expect(all[0].contactName).toBe("Anna"); // eerdere velden blijven staan

  const [row] = await listBrandRelations(db, TODAY);
  expect(row.status).toBe("wacht_op_data");
  expect(row.contactEmail).toBe("anna@artemide.it");
});

test("events: statuswijziging logt {from, to}; gelijkblijvende status logt géén status-event", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Vibia", name: "Wireflow" });

  // Eerste save: status 'benaderd' (from = virtueel 'niet_benaderd').
  await upsertBrandRelation(db, brandId, { status: "benaderd" }, "timo");
  let evts = await eventsFor(db, brandId);
  expect(evts).toHaveLength(1);
  expect(evts[0].action).toBe("brand_relation_status_changed");
  expect(evts[0].payload).toEqual({ from: "niet_benaderd", to: "benaderd" });
  expect(evts[0].actor).toBe("timo");

  // Zelfde status + notitie: alléén een updated-event, géén status-event.
  await upsertBrandRelation(db, brandId, { status: "benaderd", notes: "gebeld" }, "timo");
  evts = await eventsFor(db, brandId);
  expect(evts).toHaveLength(2);
  expect(evts[1].action).toBe("brand_relation_updated");
  expect(evts[1].payload).toEqual({ fields: ["notes"] });

  // Status én notitie tegelijk gewijzigd → beide events uit één save.
  await upsertBrandRelation(db, brandId, { status: "wacht_op_data", notes: "toegezegd" });
  evts = await eventsFor(db, brandId);
  expect(evts.map((e) => e.action)).toEqual([
    "brand_relation_status_changed",
    "brand_relation_updated",
    "brand_relation_status_changed",
    "brand_relation_updated",
  ]);
  expect(evts[2].payload).toEqual({ from: "benaderd", to: "wacht_op_data" });
});

test("prijslijst-indicator: geldig / verloopt binnenkort / verlopen / ontbreekt", async () => {
  const db = await createTestDb();
  const geldig = await seedBrandProduct(db, {
    brand: "Merk Geldig", name: "P1", validUntil: "2027-06-30",
  });
  const binnenkort = await seedBrandProduct(db, {
    brand: "Merk Binnenkort", name: "P2", validUntil: "2026-08-01", // 18 dagen
  });
  const verlopen = await seedBrandProduct(db, {
    brand: "Merk Verlopen", name: "P3", validFrom: "2025-01-01", validUntil: "2026-01-01",
  });
  // Merk zonder prijslijst.
  const kaalId = crypto.randomUUID();
  await db.insert(brands).values({ id: kaalId, name: "Merk Kaal", slug: "merk-kaal" });

  const rows = await listBrandRelations(db, TODAY);
  const by = (id: string) => rows.find((r) => r.brandId === id)!;
  expect(by(geldig.brandId).priceListIndicator).toBe("aanwezig_geldig");
  expect(by(binnenkort.brandId).priceListIndicator).toBe("verloopt_binnenkort");
  expect(by(verlopen.brandId).priceListIndicator).toBe("verlopen");
  expect(by(kaalId).priceListIndicator).toBe("ontbreekt");
  expect(by(kaalId).productCount).toBe(0);

  // Randgevallen van de gedeelde helper: vandaag zelf = nog geldig (binnenkort).
  expect(priceListIndicator("2026-07-14", TODAY)).toBe("verloopt_binnenkort");
  expect(priceListIndicator("2026-07-13", TODAY)).toBe("verlopen");
  expect(priceListIndicator(null, TODAY)).toBe("ontbreekt");
});

test("geen fan-out: merk met 2 prijslijst-rijen geeft 1 rij, indicator op de nieuwste lijst", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Merk Dubbel", name: "P1", validUntil: "2027-06-30",
  });
  // In de huidige (0008-)staat dwingt price_lists_brand_uniq één lijst per merk af;
  // de datamodel-migratie (0007, parallelle workstream) laat die index vallen zodat
  // vervangen lijsten kunnen blijven staan. Simuleer die toekomstige staat lokaal
  // in deze testdatabase zodat de aggregatie-query bewezen niet fan-out.
  // (De opvolger uit 0007 — een partial index op actieve lijsten — gaat hier ook
  // opzij: deze test gaat puur over de aggregatie, niet over de uniciteitsregels.)
  await db.execute(sql`drop index if exists price_lists_brand_uniq`);
  await db.execute(sql`drop index if exists price_lists_brand_active_uniq`);
  await db.execute(sql`
    insert into price_lists (brand_id, name, valid_from, valid_until)
    values (${brandId}, 'Oude lijst', '2024-01-01', '2025-01-01')
  `);

  const rows = await listBrandRelations(db, TODAY);
  const dubbel = rows.filter((r) => r.brandId === brandId);
  expect(dubbel).toHaveLength(1);
  expect(dubbel[0].priceListValidUntil).toBe("2027-06-30");
  expect(dubbel[0].priceListIndicator).toBe("aanwezig_geldig");
});

test("K8: merken met een gedeelde brand_code krijgen de dubbele-code-markering", async () => {
  const db = await createTestDb();
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  const c = crypto.randomUUID();
  await db.insert(brands).values([
    { id: a, name: "Merk A", slug: "merk-a", brandCode: "L052" },
    { id: b, name: "Merk B", slug: "merk-b", brandCode: "L052" },
    { id: c, name: "Merk C", slug: "merk-c", brandCode: "L099" },
  ]);

  const rows = await listBrandRelations(db, TODAY);
  const by = (id: string) => rows.find((r) => r.brandId === id)!;
  expect(by(a).sharedBrandCode).toBe(true);
  expect(by(b).sharedBrandCode).toBe(true);
  expect(by(c).sharedBrandCode).toBe(false);
});

// ── Compleetheids-aggregatie (stap 4) ────────────────────────────────────────

test("compleetheid: verwachte ratio's op deels gevulde producten", async () => {
  const db = await createTestDb();
  // Product 1: veel gevuld; product 2: kaal (zelfde merk, zelfde geldige lijst).
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Merk Deels", name: "P1", supplierArticleCode: "A-1",
    categoryPath: "Binnen > Downlights", kelvin: 3000, cri: 90,
    warrantyMonths: 60,
  });
  const { addProductToBrand } = await import("@/db/test-db");
  await addProductToBrand(db, {
    brandId, priceListId, name: "P2", supplierArticleCode: "A-2", kelvin: 2700,
  });

  const c = await getBrandCompleteness(db, brandId);
  expect(c.hasProducts).toBe(true);
  expect(c.productCount).toBe(2);
  expect(c.filledByField.supplier_article_code).toBe(2);
  expect(c.filledByField.kelvin).toBe(2);
  expect(c.filledByField.cri).toBe(1);
  expect(c.filledByField.warranty_months).toBe(1);
  expect(c.filledByField[PRICE_FIELD_KEY]).toBe(2); // beide op de geldige lijst

  const byKey = Object.fromEntries(c.buckets.map((b) => [b.bucket.key, b.score]));
  // Bucket 1 (must meetbaar: supplier_article_code, name, category_path):
  // sac 2/2, name 2/2, category 1/2 → gemiddelde (1 + 1 + 0.5) / 3.
  expect(byKey.basis_identiteit.must.ratio).toBeCloseTo(2.5 / 3, 5);
  expect(byKey.basis_identiteit.must.filled).toBe(2); // sac + name overal gevuld
  // Bucket 2: prijs = enige meetbare must → ratio 1.
  expect(byKey.commercie.must.ratio).toBe(1);
  // Bucket 6 fotometrie (meetbaar: kelvin, lumen, cri, beam_angle):
  // kelvin 2/2 =1, cri 1/2 =0.5, lumen 0, beam 0 → gemiddelde 0.375.
  expect(byKey.fotometrie.wanna.ratio).toBeCloseTo(0.375, 5);
  // Bucket 9 documentatie: niets meetbaar in v1.
  expect(byKey.documentatie_links.measurableTotal).toBe(0);
});

test("regel 2: het prijsbedrag wijzigen verandert de compleetheid niet", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "Merk Prijs", name: "P1", price: "100.00",
  });
  const before = await getBrandCompleteness(db, brandId);
  await db.execute(
    sql`update prices set gross_price = 99999.99 where product_id = ${productId}`,
  );
  const after = await getBrandCompleteness(db, brandId);
  expect(after).toEqual(before);
});

test("prijs-EXISTS respecteert valid_until: verlopen lijst telt niet als prijs", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Merk Verlopen Lijst", name: "P1",
    validFrom: "2024-01-01", validUntil: "2025-01-01",
  });
  const c = await getBrandCompleteness(db, brandId);
  expect(c.filledByField[PRICE_FIELD_KEY]).toBe(0);
  const commercie = c.buckets.find((b) => b.bucket.key === "commercie")!;
  expect(commercie.score.must.ratio).toBe(0);
});

test("getBrandCompleteness en getAllBrandCompleteness geven identieke cijfers", async () => {
  const db = await createTestDb();
  const a = await seedBrandProduct(db, {
    brand: "Merk Een", name: "P1", kelvin: 3000, color1: "wit",
  });
  const b = await seedBrandProduct(db, {
    brand: "Merk Twee", name: "P2", cri: 80,
  });
  const all = await getAllBrandCompleteness(db);
  expect(all.get(a.brandId)).toEqual(await getBrandCompleteness(db, a.brandId));
  expect(all.get(b.brandId)).toEqual(await getBrandCompleteness(db, b.brandId));
});

test("merk zonder producten: hasProducts=false (UI toont n.v.t.) en géén map-entry", async () => {
  const db = await createTestDb();
  const kaalId = crypto.randomUUID();
  await db.insert(brands).values({ id: kaalId, name: "Merk Leeg", slug: "merk-leeg" });

  const c = await getBrandCompleteness(db, kaalId);
  expect(c.hasProducts).toBe(false);
  expect(c.productCount).toBe(0);

  const all = await getAllBrandCompleteness(db);
  expect(all.has(kaalId)).toBe(false);
});
