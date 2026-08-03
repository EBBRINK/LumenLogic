// Merkrelaties-repo (stap 2): reads schrijven nooit (virtueel 'niet_benaderd'),
// upsert is de enige schrijver en logt precies de juiste events (regel 5), en de
// prijslijst-indicator deelt de datumlogica met listPriceListStatus.
import { expect, test } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import {
  brandRelations,
  brands,
  events,
  priceLists,
  prices,
  products,
} from "@/db/schema";
import { eigenVeldKey } from "@/lib/custom-fields";
import { archiveEigenVeld, createEigenVeld } from "@/lib/repo/custom-fields";
import {
  bulkSetBrandRelationStatus,
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
  // Bucket 1 (must meetbaar: supplier_article_code, name_en, category_path):
  // sac 2/2 =1, name_en 0/2 =0, category 1/2 =0.5 → gemiddelde 0.5.
  // ⚠️ Vóór 1.3-A stond hier 2.5/3: `name_en` mat toen products.name, dat de seed
  // altijd zet. Nu meet het products.name_en — leeg, want geen enkel merk heeft
  // Engelse namen aangeleverd. Die instorting IS de reparatie; niet "repareren"
  // door de seed alsnog nameEn te laten vullen.
  expect(byKey.basis_identiteit.must.ratio).toBeCloseTo(0.5, 5);
  expect(byKey.basis_identiteit.must.filled).toBe(1); // alleen sac overal gevuld
  // Bucket 2: prijs = enige meetbare must → ratio 1.
  expect(byKey.commercie.must.ratio).toBe(1);
  // Bucket 6 fotometrie: sinds 1.3-A 8 meetbare wanna-velden (kelvin, lumen_output,
  // cri, beam_angle, sdcm, efficacy, ugr, lifetime_rating).
  // kelvin 2/2 =1, cri 1/2 =0.5, de rest 0 → gemiddelde 1.5/8 = 0.1875.
  expect(byKey.fotometrie.wanna.ratio).toBeCloseTo(0.1875, 5);
  // Bucket 9 documentatie: alle vijf url_*-kolommen zijn nu meetbaar (waren 0).
  expect(byKey.documentatie_links.measurableTotal).toBe(5);
  expect(byKey.documentatie_links.wanna.ratio).toBe(0); // en allemaal nog leeg
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

// 1.6-A, BEWUSTE CONTRACTOMKERING: dit was tot 1.6 "prijs-EXISTS respecteert
// valid_until: verlopen lijst telt niet als prijs" en verwachtte ratio 0. Die naam
// beschreef het OUDE gedrag; hem laten staan terwijl de assertie omdraait zou een
// leugen zijn voor de volgende lezer (zie sprint1-6-briefing.md val 2). Zelfde seed
// (validUntil "2025-01-01") als de oude test — alleen de naam en de verwachting
// zijn omgekeerd: compleetheid meet AANLEVERING, niet geldigheid. Zichtbaarheid
// (ijzeren regel 3) is een aparte as; zie de test hieronder.
test("1.6-A: prijs op een verlopen lijst telt WEL mee in de compleetheid", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Merk Verlopen Lijst", name: "P1",
    validFrom: "2024-01-01", validUntil: "2025-01-01",
  });
  const c = await getBrandCompleteness(db, brandId);
  expect(c.filledByField[PRICE_FIELD_KEY]).toBe(1);
  const commercie = c.buckets.find((b) => b.bucket.key === "commercie")!;
  expect(commercie.score.must.ratio).toBe(1);
});

// DoD 2: de andere as van dezelfde asymmetrie. Compleetheid gaat nu omhoog voor dit
// merk, maar de catalogus (visible_products, ijzeren regel 3) blijft leeg — de
// verlopen lijst maakt het product nog altijd onvindbaar. Dat bewijst dat de twee
// assen ontkoppeld zijn: compleetheid = aanlevering, zichtbaarheid = geldigheid.
test("DoD 2: verlopen lijst — compleetheid telt de prijs, visible_products blijft leeg", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Merk Verlopen Zichtbaarheid", name: "P1",
    validFrom: "2024-01-01", validUntil: "2025-01-01",
  });
  const c = await getBrandCompleteness(db, brandId);
  expect(c.filledByField[PRICE_FIELD_KEY]).toBe(1); // compleetheid: prijs geleverd

  const visibleRes = await db.execute(
    sql`select count(*) as count from visible_products where brand_id = ${brandId}`,
  );
  const visibleRows = (
    Array.isArray(visibleRes) ? visibleRes : (visibleRes as { rows?: unknown[] }).rows ?? []
  ) as { count: string | number }[];
  expect(Number(visibleRows[0].count)).toBe(0); // zichtbaarheid: onverkort onvindbaar
});

// DoD 3: regressiecheck. Twee merken met identieke veldvulling, alleen het merk met
// de verlopen lijst is ná 1.6-A anders — en wel gelijk aan het merk met de geldige
// lijst. BrandCompleteness moet dus identiek zijn op brandId (en aggregate.productCount
// blijft ongemoeid, die is per merk toch al gelijk) na.
test("DoD 3: merk met verlopen lijst en merk met geldige lijst geven identieke compleetheid", async () => {
  const db = await createTestDb();
  const geldig = await seedBrandProduct(db, {
    brand: "Merk Regressie Geldig", name: "P1",
    supplierArticleCode: "R-1", categoryPath: "Binnen > Downlights", kelvin: 3000,
    validFrom: "2026-01-01", validUntil: "2999-12-31",
  });
  const verlopen = await seedBrandProduct(db, {
    brand: "Merk Regressie Verlopen", name: "P1",
    supplierArticleCode: "R-1", categoryPath: "Binnen > Downlights", kelvin: 3000,
    validFrom: "2024-01-01", validUntil: "2025-01-01",
  });

  const cGeldig = await getBrandCompleteness(db, geldig.brandId);
  const cVerlopen = await getBrandCompleteness(db, verlopen.brandId);

  const zonderBrandId = (c: typeof cGeldig) => {
    const { brandId: _brandId, ...rest } = c;
    return rest;
  };
  expect(zonderBrandId(cVerlopen)).toEqual(zonderBrandId(cGeldig));
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

// DoD 4e (G11), op DB-niveau: `stock` is een 🔒-veld in bucket 11 en telt niet mee
// in categorie 1-10 — de aggregate.totals mogen dus niet bewegen als het merk zijn
// eigen voorraadstand invult. bucketScore/buckets (het bevroren, per-bucket contract)
// veranderen uiteraard wél op bucket "intern" zelf; dat toetst deze test bewust niet.
test("DoD 4e (DB-niveau): stock invullen laat aggregate.totals ongemoeid", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "Merk Voorraad", name: "P1", supplierArticleCode: "V-1", kelvin: 3000,
  });
  const before = await getBrandCompleteness(db, brandId);

  await db.execute(sql`update products set stock = 5 where id = ${productId}`);

  const after = await getBrandCompleteness(db, brandId);
  expect(after.aggregate.totals).toEqual(before.aggregate.totals);
  expect(after.aggregate.scoredFieldCount).toBe(before.aggregate.scoredFieldCount);
  // Ter controle: het cijfer verandert wél, alleen in bucket 11 zelf.
  expect(after.filledByField.stock).toBe(1);
});

// ── Sprint 1.8: een eigen veld wordt gemeten via products.custom_values ──────

test("1.8: eigen veld telt mee in filledByField, met de sleutel als query-PARAMETER", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, {
    labelEn: "Recycled content (%)",
    instructionEn: "Share of recycled material in percent, e.g. 35.",
    niveau: "wanna",
    bucketKey: "duurzaamheid_milieu",
  });
  const key = eigenVeldKey(def);

  const { brandId, priceListId, productId } = await seedBrandProduct(db, {
    brand: "Merk Eigen", name: "P1", supplierArticleCode: "A-1",
  });
  const { addProductToBrand } = await import("@/db/test-db");
  const tweede = await addProductToBrand(db, {
    brandId, priceListId, name: "P2", supplierArticleCode: "A-2",
  });
  const derde = await addProductToBrand(db, {
    brandId, priceListId, name: "P3", supplierArticleCode: "A-3",
  });

  await db.update(products).set({ customValues: { [def.id]: "35" } })
    .where(eq(products.id, productId));
  // Leeggemaakt: sleutel aanwezig, waarde "". Telt NIET als dekking.
  await db.update(products).set({ customValues: { [def.id]: "" } })
    .where(eq(products.id, tweede.productId));
  // Derde product heeft de sleutel helemaal niet.
  void derde;

  const c = await getBrandCompleteness(db, brandId);
  expect(c.productCount).toBe(3);
  expect(c.filledByField[key]).toBe(1);

  // …en het invariant van 1.6-C houdt stand: wat we vragen is wat we scoren.
  expect(c.aggregate.templateFieldCount).toBe(67);
  expect(c.aggregate.scoredFieldCount).toBe(67);
  const duurzaamheid = c.aggregate.categories.find(
    (x) => x.bucketKey === "duurzaamheid_milieu",
  )!;
  expect(duurzaamheid.fields.map((f) => f.key)).toContain(key);
  expect(duurzaamheid.fields.find((f) => f.key === key)?.ratio).toBeCloseTo(1 / 3, 10);
});

test("1.8: getBrandCompleteness en getAllBrandCompleteness blijven identiek mét eigen velden", async () => {
  const db = await createTestDb();
  await createEigenVeld(db, {
    labelEn: "Recycled content (%)",
    instructionEn: "x", niveau: "wanna", bucketKey: "duurzaamheid_milieu",
  });
  const { brandId } = await seedBrandProduct(db, { brand: "Merk A", name: "P1" });
  const all = await getAllBrandCompleteness(db);
  expect(all.get(brandId)).toEqual(await getBrandCompleteness(db, brandId));
});

test("1.8: een GEARCHIVEERD eigen veld verdwijnt uit de scorecard", async () => {
  const db = await createTestDb();
  const def = await createEigenVeld(db, {
    labelEn: "Recycled content (%)",
    instructionEn: "x", niveau: "wanna", bucketKey: "duurzaamheid_milieu",
  });
  const { brandId, productId } = await seedBrandProduct(db, { brand: "Merk A", name: "P1" });
  await db.update(products).set({ customValues: { [def.id]: "35" } })
    .where(eq(products.id, productId));

  expect((await getBrandCompleteness(db, brandId)).aggregate.templateFieldCount).toBe(67);
  await archiveEigenVeld(db, def.id);
  const na = await getBrandCompleteness(db, brandId);
  expect(na.aggregate.templateFieldCount).toBe(66);
  expect(na.filledByField[eigenVeldKey(def)]).toBeUndefined();
});

// ── UX-audit 30 jul, bak 2 item 10 ───────────────────────────────────────────

test("getAllBrandCompleteness met brandIds: alleen die merken, met identieke cijfers", async () => {
  const db = await createTestDb();
  const a = await seedBrandProduct(db, {
    brand: "Merk Een", name: "P1", kelvin: 3000, color1: "wit",
  });
  const b = await seedBrandProduct(db, {
    brand: "Merk Twee", name: "P2", cri: 80,
  });

  const beperkt = await getAllBrandCompleteness(db, undefined, [a.brandId]);
  expect([...beperkt.keys()]).toEqual([a.brandId]);
  // De grens mag de UITKOMST niet veranderen — alleen hoeveel er gescand wordt.
  const alles = await getAllBrandCompleteness(db);
  expect(beperkt.get(a.brandId)).toEqual(alles.get(a.brandId));
  expect(beperkt.has(b.brandId)).toBe(false);

  // Lege selectie raakt de database niet en levert een lege map (geen kale `in ()`).
  expect(await getAllBrandCompleteness(db, undefined, [])).toEqual(new Map());
});

test("bulkSetBrandRelationStatus: één schrijfronde, per merk een event én één bulk-event", async () => {
  const db = await createTestDb();
  const a = await seedBrandProduct(db, { brand: "Merk A", name: "P1" });
  const b = await seedBrandProduct(db, { brand: "Merk B", name: "P2" });
  const c = await seedBrandProduct(db, { brand: "Merk C", name: "P3" });
  // C staat al op de doelstatus: die telt niet als wijziging en krijgt geen event.
  await upsertBrandRelation(db, c.brandId, { status: "benaderd" }, "tester");

  const res = await bulkSetBrandRelationStatus(
    db,
    // Dubbele id erin: de ON CONFLICT-clausule mag niet twee keer dezelfde rij raken.
    [a.brandId, b.brandId, c.brandId, a.brandId],
    "benaderd",
    "tester",
  );
  expect(res).toEqual({ changed: 2, unchanged: 1 });

  const statussen = await db
    .select({ brandId: brandRelations.brandId, status: brandRelations.status })
    .from(brandRelations);
  expect(statussen).toHaveLength(3);
  expect(statussen.every((r) => r.status === "benaderd")).toBe(true);

  // Regel 5 op twee niveaus: per merk het gewone status-event (zodat de merkgeschiedenis
  // niet afhangt van wélk pad de wijziging nam), plus één event voor de handeling zelf.
  const perMerk = await eventsFor(db, a.brandId);
  expect(perMerk.map((e) => e.action)).toEqual(["brand_relation_status_changed"]);
  expect(perMerk[0].payload).toEqual({
    from: "niet_benaderd",
    to: "benaderd",
    bulk: true,
  });
  expect(await eventsFor(db, c.brandId)).toHaveLength(1); // alleen de losse upsert

  const bulk = await db
    .select()
    .from(events)
    .where(eq(events.action, "brand_relation_status_bulk_set"));
  expect(bulk).toHaveLength(1);
  expect(bulk[0].payload).toEqual({
    status: "benaderd",
    requested: 3,
    changed: 2,
  });
  expect(bulk[0].actor).toBe("tester");
});

test("bulkSetBrandRelationStatus met een lege selectie doet niets — ook geen event", async () => {
  const db = await createTestDb();
  expect(await bulkSetBrandRelationStatus(db, [], "verwerkt")).toEqual({
    changed: 0,
    unchanged: 0,
  });
  expect(await db.select().from(events)).toHaveLength(0);
  expect(await db.select().from(brandRelations)).toHaveLength(0);
});

// ── 2.5b: de aanname onder de weggehaalde price_lists-join ────────────────────
// De prijs-EXISTS in completenessSelection joinde tot 2.5b nog op price_lists, terwijl
// er sinds 1.6-A niets meer uit die tabel werd gelezen of op gefilterd. Weghalen mocht
// omdat de join per constructie geen rij kón wegnemen — maar dat is een eigenschap van
// het SCHEMA, niet van de query. Wordt `price_list_id` ooit nullable, of verdwijnt de
// foreign key, dan verandert de betekenis van het cijfer stil: een prijsrij zonder lijst
// zou dan wél meetellen waar hij dat vroeger niet deed. Deze test maakt dat luidruchtig.
test("2.5b: elke prijsrij heeft per constructie exact één prijslijst", async () => {
  const db = await createTestDb();
  const kolom = await db.execute(sql`
    select a.attnotnull as not_null
    from pg_attribute a
    where a.attrelid = 'prices'::regclass and a.attname = 'price_list_id'
  `);
  const kolomRijen = (
    Array.isArray(kolom) ? kolom : ((kolom as { rows?: unknown[] }).rows ?? [])
  ) as { not_null: boolean }[];
  expect(kolomRijen[0]?.not_null).toBe(true);

  const fk = await db.execute(sql`
    select c.convalidated
    from pg_constraint c
    where c.conrelid = 'prices'::regclass
      and c.contype = 'f'
      and c.confrelid = 'price_lists'::regclass
  `);
  const fkRijen = (
    Array.isArray(fk) ? fk : ((fk as { rows?: unknown[] }).rows ?? [])
  ) as { convalidated: boolean }[];
  expect(fkRijen).toHaveLength(1);
  expect(fkRijen[0].convalidated).toBe(true);
});

// En de gedragskant: het prijscijfer telt nog steeds producten, niet prijsrijen. Een
// product met twee prijsrijen (twee lijsten) mag niet dubbel tellen — dat zou de eerste
// misrekening zijn als iemand de EXISTS ooit tot een join platslaat.
test("2.5b: twee prijslijsten op één product tellen als één geleverde prijs", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "Merk Twee Lijsten",
    name: "P1",
  });
  // `price_lists_brand_active_uniq` laat maar één níet-vervangen lijst per merk toe, dus
  // de tweede is een vervángen lijst — precies het echte geval: het product houdt zijn
  // prijsrij op de oude lijst én krijgt er één op de nieuwe.
  const [tweede] = await db
    .insert(priceLists)
    .values({
      brandId,
      name: "Vervangen lijst",
      validFrom: "2025-01-01",
      validUntil: "2025-12-31",
      replacedAt: new Date("2026-01-01T00:00:00Z"),
    })
    .returning();
  await db
    .insert(prices)
    .values({ productId, priceListId: tweede.id, grossPrice: "200.00" });

  const c = await getBrandCompleteness(db, brandId);
  expect(c.productCount).toBe(1);
  expect(c.filledByField[PRICE_FIELD_KEY]).toBe(1);
});
