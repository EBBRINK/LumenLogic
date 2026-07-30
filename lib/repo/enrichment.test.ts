// Verrijkingspijplijn (H-03…H-09): bewijst de hele lus — parser stelt voor, steekproef,
// publiceren vult de products + zet tier2_source, en blauw wordt na verrijking hermatcht.
// Ijzeren regels die hier meeliften: nooit overschrijven (alleen lege velden), herkomst
// zichtbaar per veld, en een als 'fout' beoordeeld steekproef-item wordt NIET toegepast.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  addProductToBrand,
  createTestDb,
  seedBrand,
  seedBrandAlias,
  seedBrandProduct,
} from "@/db/test-db";
import {
  enrichmentItems,
  priceLists,
  products,
  projectDossiers,
  specLines,
} from "@/db/schema";
import { addSpecLines } from "@/lib/repo/dossiers";
import { runMatcher } from "@/lib/repo/matching";
import {
  getSampleItems,
  getTier2Coverage,
  chunk,
  getRunItems,
  INSERT_CHUNK,
  listBrandLoadQueue,
  listEnrichmentRuns,
  markBrandLoaded,
  nameShape,
  pickSampleIndices,
  publishRun,
  rejectRun,
  setSampleVerdict,
  startEnrichmentRun,
  startOpticCodeRun,
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

// De insert-blokken: createRun deed één bulk-insert van alle voorstellen, en die faalt op de
// neon-HTTP-driver zodra een merk groot is (gemeten: 1.000 rijen OK, 5.000 niet — en dat zijn
// 35.000 bindparameters, ruim onder de Postgres-limiet, dus het is de payload die knelt).
test("chunk: deelt precies op, met een restblok", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  expect(chunk([], 2)).toEqual([]);
  expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  expect(() => chunk([1], 0)).toThrow();
});

test("chunk: de default blijft op de gemeten veilige grens", () => {
  expect(INSERT_CHUNK).toBe(1000);
  expect(chunk(Array.from({ length: 2500 }, (_, i) => i)).map((b) => b.length)).toEqual([
    1000, 1000, 500,
  ]);
});

// Het veldfilter (docs/plan-lege-speckolommen-xal.md): één veld tegelijk kunnen draaien maakt de
// steekproef dicht (bij XAL viel 85% van de reviewplekken op velden die niets opleverden) en
// houdt de meting falsifieerbaar. Default-gedrag moet ongewijzigd blijven.
test("veldfilter: alleen het gevraagde veld levert items op", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);

  const run = await startEnrichmentRun(db, brandId, "tester", ["cri"]);

  const items = await getRunItems(db, run.id);
  expect(items.length).toBeGreaterThan(0);
  for (const it of items) expect(it.field).toBe("cri");
  // Van de drie producten draagt alleen "SPY 39 IP54 CRI90 4000K" een CRI.
  expect(items.length).toBe(1);
  expect(items[0].value).toBe("90");
  expect((run.counts as Record<string, number>).producten).toBe(3);
});

test("veldfilter: zonder argument blijft de run over alle velden gaan", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);

  const alle = await getRunItems(db, (await startEnrichmentRun(db, brandId)).id);
  const velden = new Set(alle.map((i) => i.field));
  expect(velden.size).toBeGreaterThan(1);
  expect(velden.has("cri")).toBe(true);
  expect(velden.has("kelvin")).toBe(true);
});

// Een gefilterde run mag de andere kolommen niet aanraken bij publiceren — anders zou het
// filter alleen de voorstellen beperken en niet de werkelijke mutatie.
test("veldfilter: publiceren raakt uitsluitend het gefilterde veld", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);

  const run = await startEnrichmentRun(db, brandId, "tester", ["cri"]);
  await approveWholeSample(db, run.id);
  await publishRun(db, run.id, "tester");

  const rijen = await db.select().from(products).where(eq(products.brandId, brandId));
  const spy = rijen.find((p) => p.name.includes("SPY"))!;
  expect(spy.cri).toBe(90);
  expect(spy.kelvin).toBeNull(); // 4000K staat in de naam maar viel buiten het filter
  expect(spy.ipValue).toBeNull(); // IP54 idem
  expect(spy.tier2Source).toEqual({ cri: "parsed-from-name" });
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

  // De hele steekproef krijgt een oordeel (de poort eist dat sinds 20 jul), waarvan er
  // precies één 'fout' is — daar gaat deze test over.
  await approveWholeSample(db, run.id);
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

// O5: de hermatch is alias-aware. Een regel met boek-woord 'Intralight' krijgt via de
// gecureerde alias de canonieke wachtrij-key 'intralighting'; als Intra-lighting later
// producten krijgt moet markBrandLoaded die regel pakken — zonder de alias-map bleef
// brandKeyOf('Intralight') ('intralight') ≠ 'intralighting' en bleef de regel blauw.
test("markBrandLoaded hermatcht óók regels met een alias-boek-woord (Intralight → Intra-lighting)", async () => {
  const db = await createTestDb();

  // Canoniek merk als kale rij (nog geen producten) + de gecureerde redirect.
  const { brandId } = await seedBrand(db, "Intra-lighting");
  await seedBrandAlias(db, brandId, "intralight", "TNO-boek");

  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Alias-dossier", phase: "tender" })
    .returning();
  const [line] = await addSpecLines(db, dossier.id, [
    {
      fixtureCode: "Lp201",
      quantity: 2,
      brandText: "Intralight", // het boek-woord, niet de catalogusnaam
      productText: "Wave Round",
    },
  ]);
  await runMatcher(db, line.id); // alias resolvet, maar 0 producten → blauw

  // De wachtrij draagt de CANONIEKE key (runMatcher gebruikt outcome.brandKey).
  const queue = await listBrandLoadQueue(db);
  const item = queue.find((q) => q.brandKey === "intralighting");
  expect(item).toBeDefined();

  // Nu krijgt Intra-lighting producten (eigen prijslijst op het bestaande merk).
  const [pl] = await db
    .insert(priceLists)
    .values({
      brandId,
      name: "Prijslijst Intra-lighting",
      validFrom: "2026-01-01",
      validUntil: "2999-12-31",
    })
    .returning();
  await addProductToBrand(db, {
    brandId,
    priceListId: pl.id,
    name: "Wave Round Prisma 3000K",
    kelvin: 3000,
  });

  const res = await markBrandLoaded(db, item!.id, "tester");
  expect(res?.rematched).toBeGreaterThanOrEqual(1);

  const [afterRow] = await db
    .select({ status: specLines.status })
    .from(specLines)
    .where(eq(specLines.id, line.id));
  expect(afterRow.status).not.toBe("blauw");
});

// ── De gerepareerde steekproefpoort (20 jul) ─────────────────────────────────

test("steekproef is begrensd: 1000 items leveren nooit meer dan 100 reviewrijen", () => {
  // Vóór de reparatie: index % 3 → ~333 rijen (en op de echte XAL-run ~4.500).
  const items = Array.from({ length: 1000 }, (_, i) => ({
    productName: `SASSO ${i} FL 27W`,
    field: "beamAngle",
  }));
  expect(pickSampleIndices(items).size).toBe(100);
});

test("steekproef is gestratificeerd: elke naamvorm komt aan de beurt vóór een tweede rij", () => {
  // Eén vorm met 500 rijen, drie zeldzame vormen met elk 1. Een %3-steekproef zou de
  // zeldzame vormen bijna zeker missen; de gestratificeerde moet ze alle drie pakken.
  const items = [
    ...Array.from({ length: 500 }, (_, i) => ({
      productName: `SASSO ${i} FL 27W`,
      field: "beamAngle",
    })),
    { productName: "ANDRO 160 LENS RD WF CRI80", field: "beamAngle" },
    { productName: "BO 32 1L SP INTRACK", field: "beamAngle" },
    { productName: "ARY ADJ ME SUSP ROD", field: "beamAngle" },
  ];
  const chosen = pickSampleIndices(items);
  expect(chosen.has(500)).toBe(true);
  expect(chosen.has(501)).toBe(true);
  expect(chosen.has(502)).toBe(true);
});

test("steekproef is deterministisch: dezelfde invoer geeft dezelfde rijen", () => {
  const items = Array.from({ length: 300 }, (_, i) => ({
    productName: `TYPE ${i % 7} FL ${i}W`,
    field: "beamAngle",
  }));
  expect([...pickSampleIndices(items)].sort()).toEqual(
    [...pickSampleIndices(items)].sort(),
  );
});

test("nameShape groepeert varianten van hetzelfde patroon", () => {
  expect(nameShape("SASSO 100 FL 27W")).toBe(nameShape("SASSO 60 FL 9W"));
  expect(nameShape("SASSO 100 FL 27W")).not.toBe(nameShape("ANDRO 160 WF"));
});

test("poort met tanden: publiceren weigert zolang de steekproef ongereviewd is", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId);

  // Vóór de reparatie publiceerde dit gewoon; ongereviewde items liftten mee.
  await expect(publishRun(db, run.id)).rejects.toThrow(/niet volledig beoordeeld/);

  // en er is niets toegepast — de producten zijn onaangeroerd
  const items = await db
    .select()
    .from(enrichmentItems)
    .where(eq(enrichmentItems.runId, run.id));
  expect(items.every((i) => !i.applied)).toBe(true);

  // ná volledige review mag het wél
  await approveWholeSample(db, run.id);
  const { applied } = await publishRun(db, run.id);
  expect(applied).toBeGreaterThan(0);
});

// ── Gecureerde optiekcode → beam_angle ───────────────────────────────────────

test("optiekcode-run vult beam_angle met herkomst 'optic-code'", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO PRO 100 FL ADJ DALI 27W cob LED 3000K 220-240V",
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO PRO 100 WF ADJ DALI 26,5W cob LED 3000K 220-240V",
  });

  const run = await startOpticCodeRun(db, brandId, "tester");
  for (const it of await getSampleItems(db, run.id)) {
    expect(it.source).toBe("optic-code");
    expect(it.field).toBe("beamAngle");
    await setSampleVerdict(db, it.id, "goed");
  }
  await publishRun(db, run.id);

  const prods = await db.select().from(products).where(eq(products.brandId, brandId));
  const fl = prods.find((p) => p.name.includes(" FL "))!;
  const wf = prods.find((p) => p.name.includes(" WF "))!;
  expect(Number(fl.beamAngle)).toBe(39);
  expect(Number(wf.beamAngle)).toBe(57);
  // Herkomst zichtbaar (H-09): gecureerd, niet geparsed.
  expect(fl.tier2Source).toMatchObject({ beamAngle: "optic-code" });
});

test("optiekcode-run overschrijft een bestaande beam_angle NOOIT", async () => {
  const db = await createTestDb();
  // Echte data wint altijd van de gecureerde tabel — verrijking vult uitsluitend lege
  // kolommen. (Zelfde mechanisme dat de 96 ME/SP-rijen met hun bestaande 30° beschermt.)
  const { brandId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 RD FL CRI90 ADJ S-RECS 15,2W cob LED 3000K",
    beamAngle: 30,
  });

  const run = await startOpticCodeRun(db, brandId);
  for (const it of await getSampleItems(db, run.id)) {
    await setSampleVerdict(db, it.id, "goed");
  }
  await publishRun(db, run.id);

  const [prod] = await db.select().from(products).where(eq(products.brandId, brandId));
  expect(Number(prod.beamAngle)).toBe(30); // niet 39
  expect(prod.tier2Source ?? {}).not.toMatchObject({ beamAngle: "optic-code" });
});

test("steekproef overspant de hele catalogus, niet alleen de alfabetische kop", () => {
  // 400 distinct naamvormen, 100 plekken. De eerste versie pakte vorm 0..99 (ANDRO→INS bij
  // XAL) en liet SASSO ongezien. De steekproef moet over het hele bereik spreiden.
  // Let op: de vormen moeten in LETTERS verschillen — nameShape maakt van elke cijferreeks
  // een '#', dus "TYPE001"/"TYPE002" zouden juist één en dezelfde vorm zijn.
  const naam = (n: number) =>
    String.fromCharCode(
      97 + Math.floor(n / 676) % 26,
      97 + Math.floor(n / 26) % 26,
      97 + (n % 26),
    );
  const items = Array.from({ length: 400 }, (_, i) => ({
    productName: `${naam(i)} FL 27W`,
    field: "beamAngle",
  }));
  const chosen = [...pickSampleIndices(items)].sort((a, b) => a - b);
  expect(chosen.length).toBe(100);
  expect(chosen[0]).toBeLessThan(10); // begin gedekt
  expect(chosen[chosen.length - 1]).toBeGreaterThan(390); // én het einde
});
