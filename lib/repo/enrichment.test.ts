// Verrijkingspijplijn (H-03…H-09): bewijst de hele lus — parser stelt voor, steekproef,
// publiceren vult de products + zet tier2_source, en blauw wordt na verrijking hermatcht.
// Ijzeren regels die hier meeliften: nooit overschrijven (alleen lege velden), herkomst
// zichtbaar per veld, en een als 'fout' beoordeeld steekproef-item wordt NIET toegepast.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  addProductToBrand,
  createTestDb,
  seedBrandProduct,
} from "@/db/test-db";
import {
  enrichmentItems,
  products,
  projectDossiers,
  specLines,
} from "@/db/schema";
import { addSpecLines } from "@/lib/repo/dossiers";
import { runMatcher } from "@/lib/repo/matching";
import {
  getSampleItems,
  getTier2Coverage,
  listBrandLoadQueue,
  listEnrichmentRuns,
  markBrandLoaded,
  publishRun,
  rejectRun,
  setSampleVerdict,
  startEnrichmentRun,
} from "@/lib/repo/enrichment";

// Een merk met specs-in-de-naam maar lege matchvelden — precies waar verrijking voor is.
async function seedBrandWithBareProducts(
  db: Awaited<ReturnType<typeof createTestDb>>,
) {
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SASSO 100 17,9W 3000K",
    // matchvelden bewust leeg → parser moet ze vullen
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SPY 39 IP54 CRI90 4000K",
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "ENTERO 24W DALI 2700K 36deg",
  });
  return { brandId };
}

async function approveWholeSample(
  db: Awaited<ReturnType<typeof createTestDb>>,
  runId: string,
) {
  for (const it of await getSampleItems(db, runId)) {
    await setSampleVerdict(db, it.id, "goed");
  }
}

test("start → parser vult enrichment_items met de specs uit de naam", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);

  const run = await startEnrichmentRun(db, brandId, "tester");
  expect(run.status).toBe("steekproef");
  expect(run.brandName).toBe("Delta Light");

  // De drie producten leveren samen meerdere geparste velden (watt+kelvin, ip+cri+kelvin,
  // watt+dimmable+kelvin+beamAngle).
  const counts = run.counts as Record<string, number>;
  expect(counts.producten).toBe(3);
  expect(counts.geparsed).toBeGreaterThanOrEqual(8);

  const sample = await getSampleItems(db, run.id);
  expect(sample.length).toBeGreaterThan(0);
  for (const it of sample) {
    expect(it.source).toBe("parsed-from-name");
    expect(it.applied).toBe(false);
    expect(it.inSample).toBe(true);
  }
});

test("publiceren vult de productvelden + zet tier2_source (herkomst)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);

  const run = await startEnrichmentRun(db, brandId);
  await approveWholeSample(db, run.id);

  const { applied } = await publishRun(db, run.id, "tester");
  expect(applied).toBeGreaterThanOrEqual(8);

  const runs = await listEnrichmentRuns(db);
  expect(runs[0].status).toBe("gepubliceerd");
  expect(runs[0].publishedAt).not.toBeNull();

  // De SASSO 100 (17,9W 3000K) moet nu watt + kelvin ingevuld hebben, met herkomststempel.
  const prods = await db
    .select()
    .from(products)
    .where(eq(products.brandId, brandId));
  const sasso = prods.find((p) => p.name.startsWith("SASSO"));
  expect(sasso).toBeDefined();
  expect(Number(sasso!.maxWattage)).toBeCloseTo(17.9, 2);
  expect(sasso!.kelvin).toBe(3000);
  expect(sasso!.tier2Source).toMatchObject({
    kelvin: "parsed-from-name",
    maxWattage: "parsed-from-name",
  });

  // Tier-2-dekking is nu 100% (alle 3 producten dragen ≥1 gevuld matchveld).
  const cov = await getTier2Coverage(db);
  expect(cov.total).toBe(3);
  expect(cov.covered).toBe(3);
  expect(cov.ratio).toBeCloseTo(1, 4);
});

test("een 'fout' beoordeeld steekproef-item wordt NIET toegepast", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId);

  const sample = await getSampleItems(db, run.id);
  const target = sample[0];
  await setSampleVerdict(db, target.id, "fout");

  await publishRun(db, run.id);

  // dat specifieke item is niet toegepast
  const [after] = await db
    .select()
    .from(enrichmentItems)
    .where(eq(enrichmentItems.id, target.id));
  expect(after.applied).toBe(false);

  // en het bijbehorende veld op het product is nog leeg (niet overschreven met een fout)
  const [prod] = await db
    .select()
    .from(products)
    .where(eq(products.id, target.productId));
  expect((prod as Record<string, unknown>)[target.field]).toBeNull();
});

test("publiceren hermatcht blauwe spec-regels van het merk", async () => {
  const db = await createTestDb();

  // Dossier met een blauwe regel voor 'Delta Light' (merk nog niet in catalogus bij match).
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Testdossier", phase: "tender" })
    .returning();

  const [line] = await addSpecLines(db, dossier.id, [
    {
      fixtureCode: "Lp301",
      quantity: 5,
      brandText: "Delta Light",
      productText: "SASSO 100",
      reqKelvin: 3000,
      reqWatt: 17.9,
    },
  ]);
  // matcher draaien vóór er catalogus is → blauw (merk-datagat)
  await runMatcher(db, line.id);
  const [beforeRow] = await db
    .select({ status: specLines.status })
    .from(specLines)
    .where(eq(specLines.id, line.id));
  expect(beforeRow.status).toBe("blauw");

  // Nu het merk + product inladen en verrijken.
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId);
  await approveWholeSample(db, run.id);
  const { rematched } = await publishRun(db, run.id);
  expect(rematched).toBeGreaterThanOrEqual(1);

  // De regel is niet langer blauw (merk bestaat nu).
  const [afterRow] = await db
    .select({ status: specLines.status })
    .from(specLines)
    .where(eq(specLines.id, line.id));
  expect(afterRow.status).not.toBe("blauw");
});

test("rejectRun past niets toe en zet status op afgewezen", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId);

  const rejected = await rejectRun(db, run.id, "tester");
  expect(rejected?.status).toBe("afgewezen");

  // geen product kreeg een tier2_source
  const prods = await db
    .select()
    .from(products)
    .where(eq(products.brandId, brandId));
  for (const p of prods) expect(p.tier2Source).toBeNull();

  const cov = await getTier2Coverage(db);
  expect(cov.covered).toBe(0);
});

test("markBrandLoaded hermatcht blauwe regels van de wachtrij", async () => {
  const db = await createTestDb();

  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Wachtrij-dossier", phase: "tender" })
    .returning();
  const [line] = await addSpecLines(db, dossier.id, [
    {
      fixtureCode: "Lb101",
      quantity: 3,
      brandText: "Delta Light",
      productText: "SASSO 100",
      reqKelvin: 3000,
    },
  ]);
  await runMatcher(db, line.id); // blauw → zet merk op de wachtrij

  const queue = await listBrandLoadQueue(db);
  const item = queue.find((q) => q.brandKey === "deltalight");
  expect(item).toBeDefined();
  expect(item!.frequency).toBeGreaterThanOrEqual(1);

  // merk inladen (product bestaat nu) en de wachtrij afvinken
  await seedBrandWithBareProducts(db);
  const res = await markBrandLoaded(db, item!.id, "tester");
  expect(res?.rematched).toBeGreaterThanOrEqual(1);

  const [afterRow] = await db
    .select({ status: specLines.status })
    .from(specLines)
    .where(eq(specLines.id, line.id));
  expect(afterRow.status).not.toBe("blauw");
});
