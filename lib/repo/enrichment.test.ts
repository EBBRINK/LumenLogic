// Verrijkingspijplijn (H-03…H-09): bewijst de hele lus — parser stelt voor, steekproef,
// publiceren vult de products + zet tier2_source, en blauw wordt na verrijking hermatcht.
// Ijzeren regels die hier meeliften: nooit overschrijven (alleen lege velden), herkomst
// zichtbaar per veld, en een als 'fout' beoordeeld steekproef-item wordt NIET toegepast.
import { expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  addProductToBrand,
  createTestDb,
  seedBrand,
  seedBrandAlias,
  seedBrandProduct,
} from "@/db/test-db";
import {
  brands,
  enrichmentItems,
  enrichmentRuns,
  events,
  priceLists,
  prices,
  products,
  projectDossiers,
  specLines,
} from "@/db/schema";
import { addSpecLines } from "@/lib/repo/dossiers";
import { runMatcher } from "@/lib/repo/matching";
import {
  dismissBrandLoad,
  getSampleItems,
  getTier2Coverage,
  chunk,
  getRunItems,
  INSERT_CHUNK,
  listBrandLoadQueue,
  listEnrichmentRuns,
  listPriceListStatus,
  markBrandLoaded,
  nameShape,
  pickSampleIndices,
  publishRun,
  rejectRun,
  revertRun,
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

// GEWIJZIGD 30 jul: deze test riep `publishRun(db, run.id)` kaal aan en legde daarmee het
// OUDE contract vast — één 'fout' blokkeert alleen dát item en de rest publiceert gewoon door.
// Dat contract is vervangen: sinds de drempel weigert publishRun de hele run bij één fout
// (zie DEFAULT_MAX_SAMPLE_ERROR_RATE). Het per-item-uitsluitmechanisme bestaat nog en wordt
// hier nog steeds getoetst, maar nu via het pad waarop het bereikbaar is: een expliciet
// getypte uitzondering. Zo blijft de dekking staan zonder de nieuwe poort te ondermijnen.
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

  await publishRun(db, run.id, undefined, { maxSampleErrorRate: 1 });

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

// B7 (reviewzwerm 2.5a): setSampleVerdict accepteerde geen actor en logde niets,
// terwijl dit een MENSOORDEEL is dat bepaalt of een veld gepubliceerd wordt én dat
// meetelt in de steekproef-foutratio. FUNCTIONEEL-ONTWERP §6: élke schrijfactie
// draagt de actor.
test("setSampleVerdict logt het mensoordeel mét actor en wat er beoordeeld werd", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId);
  const [item] = await getSampleItems(db, run.id);

  await setSampleVerdict(db, item.id, "fout", "eduard@brinklicht.nl");

  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "enrichment_sample_verdict"));
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].entity).toBe("enrichment_item");
  expect(gelogd[0].entityId).toBe(item.id);
  expect(gelogd[0].actor).toBe("eduard@brinklicht.nl");
  expect(gelogd[0].payload).toEqual({
    runId: run.id,
    productName: item.productName,
    field: item.field,
    value: item.value,
    verdict: "fout",
  });

  // Een onbekend item verandert niets en logt niets.
  await setSampleVerdict(db, crypto.randomUUID(), "goed", "eduard@brinklicht.nl");
  expect(
    await db
      .select()
      .from(events)
      .where(eq(events.action, "enrichment_sample_verdict")),
  ).toHaveLength(1);
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

// UX-audit 30 jul (bug #12): de wachtrij raakt vervuild met zoneteksten die de parser als
// merk las ('Divers', 'Vergaderruimte', 'Toilet'). Voor die rijen was "Mark as loaded" de
// enige actie — en die is onwaar. dismissBrandLoad voert de rij af én laat een spoor na
// (ijzeren regel 5). Wat NIET verandert: de spec-regel zelf blijft blauw staan, want er is
// niets ingeladen; alleen de wachtrij is opgeschoond.
test("dismissBrandLoad haalt een niet-merk van de wachtrij en logt dat", async () => {
  const db = await createTestDb();

  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Vervuild dossier", phase: "tender" })
    .returning();
  const [line] = await addSpecLines(db, dossier.id, [
    {
      fixtureCode: "Lz001",
      quantity: 1,
      brandText: "Vergaderruimte", // zonenaam, geen merk
      productText: "downlight",
    },
  ]);
  await runMatcher(db, line.id); // blauw → zonenaam belandt op de wachtrij

  const before = await listBrandLoadQueue(db);
  const junk = before.find((q) => q.displayName === "Vergaderruimte");
  expect(junk).toBeDefined();

  const res = await dismissBrandLoad(db, junk!.id, "tester");
  expect(res?.displayName).toBe("Vergaderruimte");

  // De rij is weg uit de wachtrij.
  const after = await listBrandLoadQueue(db);
  expect(after.find((q) => q.id === junk!.id)).toBeUndefined();

  // …en het spoor staat in de events-tabel, mét de merksleutel en de reden.
  const logged = await db
    .select()
    .from(events)
    .where(eq(events.action, "brand_load_dismissed"));
  expect(logged).toHaveLength(1);
  expect(logged[0].actor).toBe("tester");
  expect(logged[0].payload).toMatchObject({
    displayName: "Vergaderruimte",
    reason: "not_a_brand",
  });

  // De regel is niet stilletjes "opgelost": hij blijft blauw.
  const [afterLine] = await db
    .select({ status: specLines.status })
    .from(specLines)
    .where(eq(specLines.id, line.id));
  expect(afterLine.status).toBe("blauw");
});

test("dismissBrandLoad op een onbekend id doet niets en gooit niet", async () => {
  const db = await createTestDb();
  const res = await dismissBrandLoad(
    db,
    "00000000-0000-0000-0000-000000000000",
    "tester",
  );
  expect(res).toBeNull();
});

// REPARATIE 30 jul, bevinding 2: de queueId komt uit FormData en ging ongefilterd in
// `eq(brandLoadQueue.id, …)`. Dat is een uuid-kolom, dus Postgres gooit `invalid input
// syntax for type uuid` (22P02) — nergens afgevangen, dus een 500. Eén commit ná
// 8811d95 "Uuid-guard sluitend". Beide wachtrij-acties, want het gat in markBrandLoaded
// was ouder.
test("de wachtrij-acties gooien niet op een id dat geen uuid is", async () => {
  const db = await createTestDb();
  for (const rommel of ["not-a-uuid", "", "1", "'; drop table brands; --"]) {
    await expect(dismissBrandLoad(db, rommel, "tester")).resolves.toBeNull();
    await expect(markBrandLoaded(db, rommel, "tester")).resolves.toBeNull();
  }
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

// ── Prijslijst-dekking: de badge op /brand-management/price-lists mag niet liegen ─────────
//
// UX-audit 30 jul (bug #3): het scherm gaf groen "154 d valid" bij 0 producten. Voor de
// matcher is dat hetzelfde gat als een verlopen lijst — ijzeren regel 3. De weergave beslist
// dat, maar ze kan het alleen als deze query dekking én levensfase meelevert. Twee dingen die
// stil kunnen breken en daarom hier vastliggen: de count over een lijst zonder één prijs moet
// 0 zijn (LEFT JOIN, geen INNER), en brands.lifecycle moet in de GROUP BY staan — vergeet je
// dat, dan gooit Postgres en valt het scherm om.
test("listPriceListStatus: 0 producten en de levensfase van het merk komen mee", async () => {
  const db = await createTestDb();

  // Een lijst met één product, op een merk dat niet meer bestaat — de brondata heeft dat
  // vandaag als naamstring ('Lucente (BESTAAT NIET MEER)'), het schema als kolom.
  const { brandId } = await seedBrandProduct(db, {
    brand: "Lucente",
    name: "Vela 20W 3000K",
  });
  await db
    .update(brands)
    .set({ lifecycle: "bestaat_niet_meer" })
    .where(eq(brands.id, brandId));

  // En een lijst die ruim geldig is maar geen énkele prijs draagt: nul zichtbare producten.
  const { brandId: leegId } = await seedBrand(db, "Itre");
  await db.insert(priceLists).values({
    brandId: leegId,
    name: "Prijslijst Itre",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });

  const rows = await listPriceListStatus(db);

  const dood = rows.find((r) => r.brandName === "Lucente");
  expect(dood?.lifecycle).toBe("bestaat_niet_meer");
  expect(dood?.productCount).toBe(1);

  const leeg = rows.find((r) => r.brandName === "Itre");
  expect(leeg?.productCount).toBe(0);
  expect(leeg?.bucket).toBe("ok"); // de datum is niet het probleem, de dekking is het
  expect(leeg?.lifecycle).toBe("actief"); // norm, dus geen badge op het scherm
});

// ── 2.5b: de telling verhuisde vóór de join ──────────────────────────────────
// listPriceListStatus telde eerst met een LEFT JOIN op prices + GROUP BY over de
// prijslijst-kolommen; nu telt een subquery per price_list_id en wordt die uitkomst
// aangekoppeld. Dat is puur snelheid (220 → 51 ms op productie, de oude vorm viel met
// een external merge sort van 18 MB op schijf), dus het cijfer MOET identiek blijven.
// Deze test draait de oude formulering ernaast op dezelfde data en vergelijkt.
test("2.5b: de nieuwe telling geeft exact dezelfde aantallen als de oude LEFT JOIN", async () => {
  const db = await createTestDb();

  // Drie vormen naast elkaar: een lijst met meerdere prijzen, een lijst zonder prijzen,
  // en een vervangen lijst die zijn oude prijsrij houdt.
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SASSO 100",
  });
  await addProductToBrand(db, { brandId, priceListId, name: "SPY 39" });
  await addProductToBrand(db, { brandId, priceListId, name: "ENTERO 24W" });

  const { brandId: leegId } = await seedBrand(db, "Itre");
  await db.insert(priceLists).values({
    brandId: leegId,
    name: "Prijslijst Itre",
    validFrom: "2026-01-01",
    validUntil: "2999-12-31",
  });

  const { brandId: vervangenId, productId } = await seedBrandProduct(db, {
    brand: "Flos",
    name: "IC Lights",
  });
  const [oud] = await db
    .insert(priceLists)
    .values({
      brandId: vervangenId,
      name: "Flos 2025",
      validFrom: "2025-01-01",
      validUntil: "2025-12-31",
      replacedAt: new Date("2026-01-01T00:00:00Z"),
    })
    .returning();
  await db
    .insert(prices)
    .values({ productId, priceListId: oud.id, grossPrice: "150.00" });

  // De OUDE formulering, letterlijk zoals hij tot 2.5b in de repo stond.
  const oudeRijen = await db
    .select({
      id: priceLists.id,
      productCount: sql<number>`count(${prices.id})`,
    })
    .from(priceLists)
    .leftJoin(brands, eq(brands.id, priceLists.brandId))
    .leftJoin(prices, eq(prices.priceListId, priceLists.id))
    .groupBy(
      priceLists.id,
      priceLists.name,
      priceLists.validUntil,
      priceLists.replacedAt,
      brands.name,
      brands.lifecycle,
    );
  const oudPerLijst = new Map(
    oudeRijen.map((r) => [r.id, Number(r.productCount)]),
  );

  const nieuw = await listPriceListStatus(db);
  expect(nieuw).toHaveLength(4); // 3 merken, waarvan één met twee lijsten
  expect(oudPerLijst.size).toBe(nieuw.length);
  for (const r of nieuw) {
    expect(r.productCount, `prijslijst ${r.name}`).toBe(oudPerLijst.get(r.id));
  }
  // En de drie vormen dragen echt verschillende aantallen — anders bewijst de
  // vergelijking hierboven niets.
  expect([...oudPerLijst.values()].sort()).toEqual([0, 1, 1, 3]);
});

// ── De gebundelde publish (30 jul) ───────────────────────────────────────────
// publishRun deed per product drie losse round-trips (select, update product, update item).
// Gemeten op de branch: 135–152 ms elk, dus 12,6 uur voor de hele catalogus. De lus is
// vervangen door één select + één UPDATE … FROM (VALUES …) per blok van 500.
//
// Deze tests bewijzen niet de snelheid maar de GELIJKHEID: de gebundelde vorm moet exact
// dezelfde uitkomst geven als de regels die hij vervangt — inclusief de drie eigenschappen
// waar het bij een onomkeerbare publish op aankomt.

test("gebundelde publish vult lege velden, laat gevulde ongemoeid en stempelt herkomst per veld", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Bundeltest",
    name: "ALFA 20W 3000K CRI90",
    // alles leeg → alle drie de velden moeten landen
  });
  // Product 2: kelvin staat AL gevuld met een andere waarde — die mag niet wijken.
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "BETA 30W 4000K CRI80",
    kelvin: 2700,
  });
  // Product 3: de naam draagt niets → geen voorstel, geen stempel.
  await addProductToBrand(db, { brandId, priceListId, name: "GAMMA plain" });

  const run = await startEnrichmentRun(db, brandId, "test");
  for (const it of await getSampleItems(db, run.id)) {
    await setSampleVerdict(db, it.id, "goed");
  }
  await publishRun(db, run.id, "test");

  const rows = await db.select().from(products).where(eq(products.brandId, brandId));
  const alfa = rows.find((r) => r.name.startsWith("ALFA"))!;
  const beta = rows.find((r) => r.name.startsWith("BETA"))!;
  const gamma = rows.find((r) => r.name.startsWith("GAMMA"))!;

  expect(alfa.kelvin).toBe(3000);
  expect(alfa.cri).toBe(90);
  expect(Number(alfa.maxWattage)).toBe(20);
  // herkomst per veld, niet per product
  expect(alfa.tier2Source).toMatchObject({
    kelvin: "parsed-from-name",
    cri: "parsed-from-name",
    maxWattage: "parsed-from-name",
  });

  // NOOIT OVERSCHRIJVEN: kelvin blijft 2700, maar cri/watt landen wél op hetzelfde product…
  expect(beta.kelvin).toBe(2700);
  expect(beta.cri).toBe(80);
  // …en juist dáárom mag er GEEN kelvin-stempel op staan: een veld dat niet landt, krijgt
  // geen herkomst. In de oude lus konden die twee uiteenlopen.
  expect((beta.tier2Source as Record<string, string>).kelvin).toBeUndefined();
  expect((beta.tier2Source as Record<string, string>).cri).toBe("parsed-from-name");

  expect(gamma.tier2Source).toBeNull();
});

test("een tweede publish op hetzelfde merk voegt niets toe (idempotent)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);

  const run1 = await startEnrichmentRun(db, brandId, "test");
  for (const it of await getSampleItems(db, run1.id)) await setSampleVerdict(db, it.id, "goed");
  const eerste = await publishRun(db, run1.id, "test");
  expect(eerste.applied).toBeGreaterThan(0);

  // Alles staat nu gevuld. Een verse run stelt dezelfde waarden voor, maar coalesce in de
  // database houdt de bestaande waarde vast — dus er mag NUL toegepast worden. Zou dit
  // getal boven nul komen, dan is "vult uitsluitend lege velden" gebroken.
  const run2 = await startEnrichmentRun(db, brandId, "test");
  for (const it of await getSampleItems(db, run2.id)) await setSampleVerdict(db, it.id, "goed");
  const tweede = await publishRun(db, run2.id, "test");
  expect(tweede.applied).toBe(0);
});

// GEWIJZIGD 30 jul: deze test eiste dat een voorstel op een BEZETTE kolom wél als item
// bestaat maar niet wordt toegepast. Sinds startEnrichmentRun alleen nog voorstellen maakt
// voor LEGE kolommen, bestaat dat item niet meer — en dat is de verbetering, niet een
// regressie. Aanleiding: op Kreon konden 21.359 van de 32.917 voorstellen (65 %) nooit landen,
// en 64 van Timo's 100 steekproefrijen vielen op zo'n kolom. Die rijen kostten hem zijn beurt
// zonder iets te kunnen bewijzen.
//
// Wat de test nu vastlegt: de bezette kolom levert géén item, het aantal staat geteld in
// counts.kolomAlGevuld, en `applied` telt nog steeds precies de gelande items.
test("een bezette kolom levert geen voorstel meer, en dat wordt geteld", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Teltest",
    name: "DELTA 15W 3500K",
    kelvin: 6500, // bezet → hier komt geen kelvin-voorstel meer van
  });

  const run = await startEnrichmentRun(db, brandId, "test");
  const items = await getRunItems(db, run.id);
  expect(items.find((i) => i.field === "kelvin")).toBeUndefined();
  expect(items.find((i) => i.field === "maxWattage")).toBeDefined();
  expect((run.counts as Record<string, unknown>).kolomAlGevuld).toMatchObject({ kelvin: 1 });

  for (const it of await getSampleItems(db, run.id)) await setSampleVerdict(db, it.id, "goed");
  const { applied } = await publishRun(db, run.id, "test");
  const na = await getRunItems(db, run.id);
  expect(applied).toBe(na.filter((i) => i.applied).length);
  expect(applied).toBe(1);
});

test("een onzinnige waarde op een numeric-kolom laat de bundel niet klappen", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "Numerictest",
    name: "EPSILON plain",
  });
  const run = await startEnrichmentRun(db, brandId, "test");

  // Handmatig een item met een niet-numerieke waarde op een numeric-kolom, zoals een
  // leverancierscel "OHNE LM" die langs een bron-normalisator glipt. Vóór de
  // Number.isFinite-toets in toColumnValue belandde die ongefilterd in de update: in de
  // oude lus brak dat de lus halverwege af, in een bundel zou het alle 500 rijen meenemen.
  await db.insert(enrichmentItems).values({
    runId: run.id,
    productId,
    productName: "EPSILON plain",
    field: "maxWattage",
    value: "OHNE LM",
    source: "parsed-from-name",
    inSample: false,
  });
  // en één geldig item ernaast, dat wél moet landen
  await db.insert(enrichmentItems).values({
    runId: run.id,
    productId,
    productName: "EPSILON plain",
    field: "kelvin",
    value: "3000",
    source: "parsed-from-name",
    inSample: false,
  });

  for (const it of await getSampleItems(db, run.id)) await setSampleVerdict(db, it.id, "goed");
  const { applied } = await publishRun(db, run.id, "test");

  const [p] = await db.select().from(products).where(eq(products.id, productId));
  expect(p.maxWattage).toBeNull(); // de onzin is geweigerd…
  expect(p.kelvin).toBe(3000); // …en de goede waarde ernaast is gewoon geland
  expect(applied).toBe(1);
});

// ── De drempel en de terugweg (30 jul) ───────────────────────────────────────

test("publiceren wordt geblokkeerd zodra er één 'fout' in de steekproef staat", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId, "test");

  const sample = await getSampleItems(db, run.id);
  await setSampleVerdict(db, sample[0].id, "fout");
  for (const it of sample.slice(1)) await setSampleVerdict(db, it.id, "goed");

  await expect(publishRun(db, run.id, "test")).rejects.toThrow(/foutratio/i);

  // Niets toegepast, en de run staat nog op 'steekproef' — dus rejectRun kan nog.
  const [p] = await db.select().from(products).where(eq(products.brandId, brandId));
  expect(p.kelvin).toBeNull();
  const [naRun] = await db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, run.id));
  expect(naRun.status).toBe("steekproef");
});

test("een bewuste uitzondering moet expliciet getypt worden", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId, "test");
  const sample = await getSampleItems(db, run.id);
  await setSampleVerdict(db, sample[0].id, "fout");
  for (const it of sample.slice(1)) await setSampleVerdict(db, it.id, "goed");

  const { applied } = await publishRun(db, run.id, "test", { maxSampleErrorRate: 1 });
  expect(applied).toBeGreaterThan(0);
});

test("revertRun neemt terug wat de run zette, en laat de rest staan", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "Reverttest",
    name: "ZETA 12W 3000K CRI95",
  });
  const run = await startEnrichmentRun(db, brandId, "test");
  for (const it of await getSampleItems(db, run.id)) await setSampleVerdict(db, it.id, "goed");
  const { applied } = await publishRun(db, run.id, "test");
  expect(applied).toBe(3);

  // Iemand corrigeert ná publicatie één veld met de hand: dat is niet meer ónze waarde.
  await db.update(products).set({ cri: 80 }).where(eq(products.id, productId));

  const uit = await revertRun(db, run.id, "test");
  expect(uit).toEqual({ teruggedraaid: 2, overgeslagen: 1 });

  const [p] = await db.select().from(products).where(eq(products.id, productId));
  expect(p.kelvin).toBeNull();
  expect(p.maxWattage).toBeNull();
  expect(p.cri).toBe(80); // de handmatige correctie blijft staan
  expect(p.tier2Source).toMatchObject({ cri: "parsed-from-name" }); // en houdt zijn stempel
  expect((p.tier2Source as Record<string, string>).kelvin).toBeUndefined();

  const [naRun] = await db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, run.id));
  expect(naRun.status).toBe("teruggedraaid");
});

test("revertRun weigert vóór publicatie — daar is rejectRun voor", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandWithBareProducts(db);
  const run = await startEnrichmentRun(db, brandId, "test");
  await expect(revertRun(db, run.id, "test")).rejects.toThrow(/alleen na publiceren/i);
});

test("na revertRun kan een andere bron de kolom alsnog claimen", async () => {
  const db = await createTestDb();
  const { brandId, productId } = await seedBrandProduct(db, {
    brand: "Claimtest",
    name: "ETA 3000K",
  });
  const run1 = await startEnrichmentRun(db, brandId, "test");
  for (const it of await getSampleItems(db, run1.id)) await setSampleVerdict(db, it.id, "goed");
  await publishRun(db, run1.id, "test");
  await revertRun(db, run1.id, "test");

  // Dit is de hele reden dat revertRun bestaat: "wie eerst gaat, wint" is nu opzegbaar.
  const run2 = await startEnrichmentRun(db, brandId, "test");
  for (const it of await getSampleItems(db, run2.id)) await setSampleVerdict(db, it.id, "goed");
  const { applied } = await publishRun(db, run2.id, "test");
  expect(applied).toBe(1);
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  expect(p.kelvin).toBe(3000);
});

// ── De voorstelpoort (30 jul) ────────────────────────────────────────────────

test("voorstelpoort weert een kelvin-BEREIK maar laat de rest van dezelfde naam staan", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, {
    brand: "Poorttest",
    name: "PANEL 40W 2700-6500K DALI",
  });
  const run = await startEnrichmentRun(db, brandId, "test");
  const items = await getRunItems(db, run.id);
  const velden = items.map((i) => i.field).sort();

  // kelvin sneuvelt: judgeKelvin eist exacte gelijkheid, dus één representant uit een bereik
  // maakt van een product dat 4000 K kán leveren een RODE kandidaat.
  expect(velden).not.toContain("kelvin");
  // watt en dimbaarheid staan los van dat bezwaar en blijven gewoon staan.
  expect(velden).toContain("maxWattage");
  expect(velden).toContain("dimmable");

  // En het geweerde voorstel is geteld, niet stil verdwenen — anders is "minder voorstellen"
  // niet te onderscheiden van "minder data".
  expect((run.counts as Record<string, unknown>).onderdrukt).toMatchObject({
    "kelvin:bereik": 1,
  });
});

test("voorstelpoort laat accessoire-context WEL door", async () => {
  const db = await createTestDb();
  // Gemeten: bij Prado is 0,0% van de accessoire-vlaggen werkelijk een onderdeel — 1.740 van
  // de 1.870 zijn "- black adapter", een variantsuffix van een armatuur. Onderdrukken op deze
  // vlag zou duizenden juiste waarden weggooien, dus hij routeert de zwerm en filtert niet.
  const { brandId } = await seedBrandProduct(db, {
    brand: "Adaptertest",
    name: "acrotrack mini long black ano 2700K 60°pc CRI90 - black adapter",
  });
  const run = await startEnrichmentRun(db, brandId, "test");
  const velden = (await getRunItems(db, run.id)).map((i) => i.field);
  expect(velden).toContain("kelvin");
  expect(velden).toContain("cri");
});
