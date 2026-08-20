// De querylaag onder het prijslijst-overzicht. PGlite, dezelfde migraties als Neon.
// Wat hier getest wordt is TELLEN, niet rekenen — de formule zelf staat in
// lib/price-list-urgency.test.ts.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  brandAliases,
  brandLoadQueue,
  brands,
  events,
  projectDossiers,
  specLines,
} from "@/db/schema";
import { listBrandUrgency } from "./price-list-urgency";
import { urgencyScore } from "@/lib/price-list-urgency";

const VANDAAG = new Date("2026-08-20T12:00:00Z");

async function seedDossier(db: TestDb, name = "Project") {
  const [row] = await db
    .insert(projectDossiers)
    .values({ name })
    .returning({ id: projectDossiers.id });
  return row.id;
}

async function seedRegel(
  db: TestDb,
  dossierId: string,
  values: Partial<typeof specLines.$inferInsert> = {},
) {
  await db
    .insert(specLines)
    .values({ dossierId, fixtureCode: "Lp301", ...values });
}

function vind(rijen: Awaited<ReturnType<typeof listBrandUrgency>>, naam: string) {
  const rij = rijen.find((r) => r.brandName === naam);
  if (!rij) throw new Error(`geen rij voor ${naam}`);
  return rij;
}

test("elk merk krijgt een rij, ook een merk zonder prijslijst", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "Delta Light", name: "SASSO 100", validUntil: "2026-09-01" });
  // Een merk zonder prijslijst en zonder producten: het grootste dekkingsgat dat er is, en
  // precies het geval dat een per-prijslijst-overzicht niet kan tonen.
  await db.insert(brands).values({ id: crypto.randomUUID(), name: "Kreon", slug: "kreon" });

  const rijen = await listBrandUrgency(db, VANDAAG);

  expect(rijen.map((r) => r.brandName)).toEqual(["Delta Light", "Kreon"]);
  const kreon = vind(rijen, "Kreon");
  expect(kreon.priceListId).toBeNull();
  expect(kreon.daysLeft).toBeNull();
  expect(kreon.priceCount).toBe(0);
  const delta = vind(rijen, "Delta Light");
  expect(delta.daysLeft).toBe(12);
  expect(delta.priceCount).toBe(1);
  expect(delta.productCount).toBe(1);
});

test("projecten tellen dossiers, niet regels — en alleen binnen twaalf maanden", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO" });
  const d1 = await seedDossier(db, "Project A");
  const d2 = await seedDossier(db, "Project B");
  await seedRegel(db, d1, { brandText: "XAL" });
  await seedRegel(db, d1, { brandText: "xal " }); // zelfde dossier, vrije tekst, andere vorm
  await seedRegel(db, d2, { brandText: "XAL" });
  // Ouder dan het venster: telt niet mee. Een merk dat in 2023 populair was zegt niets
  // over het werk van vandaag.
  await seedRegel(db, d2, {
    brandText: "XAL",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  });

  const xal = vind(await listBrandUrgency(db, VANDAAG), "XAL");
  expect(xal.demand.projects12m).toBe(2);
  expect(xal.demand.lines12m).toBe(3);
});

test("een alias landt op het merk zelf", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Tekna", name: "Nautic 1" });
  await db.insert(brandAliases).values({ brandId, aliasKey: "teknanautic", note: "Tekna Nautic" });
  const d = await seedDossier(db);
  await seedRegel(db, d, { brandText: "Tekna Nautic" });

  expect(vind(await listBrandUrgency(db, VANDAAG), "Tekna").demand.lines12m).toBe(1);
});

test("zoeken, overwegen, kiezen en de wachtrij komen allemaal binnen", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, { brand: "Occhio", name: "Mito" });
  const d = await seedDossier(db);
  await seedRegel(db, d, { brandText: "Occhio", matchedProductId: productId });
  await db.insert(events).values([
    { entity: "spec_line", action: "search", actor: "timo", payload: { query: "mito", brand: "Occhio", resultCount: 4 } },
    { entity: "spec_line", action: "search", actor: "timo", payload: { query: "mito xl", brand: "Occhio", resultCount: 0 } },
    // Ruis uit onze eigen rooktests is geen vraag — zelfde filter als analytics tegel 6/8.
    { entity: "spec_line", action: "search", actor: "timo", payload: { query: "ZZTEST mito", brand: "Occhio", resultCount: 0 } },
    { entity: "spec_line", action: "product_considered", actor: "timo", payload: { productId } },
    // Een kapotte uuid-payload mag de ::uuid-cast en dus de hele pagina niet breken.
    { entity: "spec_line", action: "product_considered", actor: "timo", payload: { productId: "geen-uuid" } },
  ]);
  await db.insert(brandLoadQueue).values({ brandKey: "occhio", displayName: "Occhio", frequency: 5 });

  const occhio = vind(await listBrandUrgency(db, VANDAAG), "Occhio");
  expect(occhio.brandId).toBe(brandId);
  expect(occhio.demand.searches12m).toBe(2);
  expect(occhio.demand.unmetDemand12m).toBe(1);
  expect(occhio.demand.considered12m).toBe(1);
  expect(occhio.demand.chosen12m).toBe(1);
  expect(occhio.demand.loadQueueDemand).toBe(5);
});

test("gevraagd-maar-niet-in-de-catalogus telt alleen bij een merk zonder producten", async () => {
  const db = await createTestDb();
  await db.insert(brands).values({ id: crypto.randomUUID(), name: "Vibia", slug: "vibia" });
  await seedBrandProduct(db, { brand: "Flos", name: "IC Lights" });
  const d = await seedDossier(db);
  await seedRegel(db, d, { brandText: "Vibia" });
  await seedRegel(db, d, { brandText: "Flos" });

  const rijen = await listBrandUrgency(db, VANDAAG);
  expect(vind(rijen, "Vibia").demand.requestedNotInCatalogue).toBe(1);
  // Bij Flos is dezelfde vraag geen dekkingsgat maar gewone vraag: die telt al via lines12m.
  expect(vind(rijen, "Flos").demand.requestedNotInCatalogue).toBe(0);
  expect(vind(rijen, "Flos").demand.lines12m).toBe(1);
});

test("het Vesoi-geval, end-to-end door de query heen", async () => {
  const db = await createTestDb();
  // Een jaar verlopen, niemand vraagt ernaar.
  await seedBrandProduct(db, {
    brand: "Vesoi",
    name: "Post Krisi",
    validFrom: "2024-01-01",
    validUntil: "2025-08-20",
  });
  // Verloopt over twaalf dagen, zit in drie projecten.
  await seedBrandProduct(db, { brand: "Delta Light", name: "SPY 39", validUntil: "2026-09-01" });
  for (const naam of ["A", "B", "C"]) {
    const d = await seedDossier(db, `Project ${naam}`);
    await seedRegel(db, d, { brandText: "Delta Light" });
  }

  const rijen = await listBrandUrgency(db, VANDAAG);
  const vesoi = vind(rijen, "Vesoi");
  const delta = vind(rijen, "Delta Light");
  expect(vesoi.daysLeft).toBe(-365);
  expect(urgencyScore(delta)).toBeGreaterThan(urgencyScore(vesoi));
});
