// Querylaag onder /analytics (sprint 2.1 + 2.2). Elke tegel krijgt één gevuld geval, plus de
// drie randen die de pagina kunnen breken: een lege database (besluit 4), een event met een
// kapotte uuid-payload, en de org-scope. PGlite, dezelfde migraties als Neon.
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  brandLoadQueue,
  events,
  organizations,
  projectDossiers,
  quoteLines,
  quotes,
  specLines,
} from "@/db/schema";
import { getAnalyticsTiles } from "./analytics-tiles";

// ── seedhulpjes ──────────────────────────────────────────────────────────────
async function seedDossier(db: TestDb, name = "Project", orgId: string | null = null) {
  const [row] = await db
    .insert(projectDossiers)
    .values({ name, orgId })
    .returning({ id: projectDossiers.id });
  return row.id;
}

async function seedSpecLine(
  db: TestDb,
  dossierId: string,
  values: Partial<typeof specLines.$inferInsert> = {},
) {
  const [row] = await db
    .insert(specLines)
    .values({ dossierId, fixtureCode: "Lp301", ...values })
    .returning({ id: specLines.id });
  return row.id;
}

// Direct inserten i.p.v. via logEvent: de tegels rekenen met created_at (meetperiode,
// ISO-week-grens) en dat veld kan logEvent niet zetten.
async function seedEvent(
  db: TestDb,
  values: {
    action: string;
    entityId?: string | null;
    actor?: string;
    payload?: Record<string, unknown>;
    createdAt?: Date;
  },
) {
  await db.insert(events).values({
    entity: "spec_line",
    entityId: values.entityId ?? null,
    action: values.action,
    actor: values.actor ?? "timo",
    payload: values.payload ?? null,
    ...(values.createdAt ? { createdAt: values.createdAt } : {}),
  });
}

const dag = (d: string) => new Date(`${d}T10:00:00Z`);

// ── 1. period ────────────────────────────────────────────────────────────────
test("period: eerste/laatste event, totaal, actors en actieve dagen", async () => {
  const db = await createTestDb();
  await seedEvent(db, { action: "search", actor: "timo", createdAt: dag("2026-07-02") });
  await seedEvent(db, { action: "search", actor: "timo", createdAt: dag("2026-07-02") });
  await seedEvent(db, { action: "match", actor: "eduard", createdAt: dag("2026-07-21") });

  const { period } = await getAnalyticsTiles(db);
  expect(period.totalEvents).toBe(3);
  expect(period.actors).toBe(2);
  expect(period.activeDays).toBe(2);
  expect(period.from).toBe("2026-07-02T10:00:00Z");
  expect(period.to).toBe("2026-07-21T10:00:00Z");
});

// ── 2. consideredProducts ────────────────────────────────────────────────────
test("consideredProducts: telt per product én per lijst, hoogste eerst", async () => {
  const db = await createTestDb();
  const sasso = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });
  const ander = await seedBrandProduct(db, { brand: "ETAP", name: "U7" });

  for (let i = 0; i < 3; i++) {
    await seedEvent(db, {
      action: "product_considered",
      payload: { productId: sasso.productId, list: "aantoonbaar" },
    });
  }
  await seedEvent(db, {
    action: "product_considered",
    payload: { productId: sasso.productId, list: "onvolledig" },
  });
  await seedEvent(db, {
    action: "product_considered",
    payload: { productId: ander.productId, list: "aantoonbaar" },
  });

  const { consideredProducts } = await getAnalyticsTiles(db);
  expect(consideredProducts).toHaveLength(3);
  expect(consideredProducts[0]).toEqual({
    brand: "XAL",
    name: "SASSO 100 SQ",
    list: "aantoonbaar",
    count: 3,
  });
  const onvolledig = consideredProducts.find((r) => r.list === "onvolledig");
  expect(onvolledig?.count).toBe(1);
  expect(typeof consideredProducts[0].count).toBe("number");
});

// ── 3. statusSplit ───────────────────────────────────────────────────────────
test("statusSplit: telt matched_status per status, aflopend", async () => {
  const db = await createTestDb();
  for (const status of ["blauw", "blauw", "blauw", "rood", "groen"]) {
    await seedEvent(db, { action: "matched_status", payload: { status } });
  }
  // andere acties tellen niet mee
  await seedEvent(db, { action: "search", payload: { query: "iets", resultCount: 2 } });

  const { statusSplit } = await getAnalyticsTiles(db);
  expect(statusSplit).toEqual([
    { status: "blauw", count: 3 },
    { status: "groen", count: 1 },
    { status: "rood", count: 1 },
  ]);
});

// ── 4. breakdown ─────────────────────────────────────────────────────────────
test("breakdown: veld × oordeel uit de deviations-jsonb", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);
  await seedSpecLine(db, dossierId, {
    deviations: [
      { field: "kelvin", requested: 3000, delivered: 2700, verdict: "groen" },
      { field: "cri", requested: 90, delivered: null, verdict: "onbekend" },
    ],
  });
  await seedSpecLine(db, dossierId, {
    deviations: [{ field: "kelvin", requested: 4000, delivered: 3000, verdict: "groen" }],
  });
  // regel zonder afwijkingen mag de LATERAL niet breken
  await seedSpecLine(db, dossierId, { deviations: null });

  const { breakdown } = await getAnalyticsTiles(db);
  expect(breakdown).toEqual([
    { field: "kelvin", verdict: "groen", count: 2 },
    { field: "cri", verdict: "onbekend", count: 1 },
  ]);
});

// ── 5. specGaps ──────────────────────────────────────────────────────────────
test("specGaps: ontbrekend aantal/kelvin/watt/lumen/merk per veld, met totaal", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);
  await seedSpecLine(db, dossierId, {
    quantity: 4,
    reqKelvin: 3000,
    reqWatt: "18.00",
    reqLumen: 2000,
    brandText: "XAL",
  });
  await seedSpecLine(db, dossierId, { quantity: null, brandText: "" });
  await seedSpecLine(db, dossierId, { quantity: null, reqKelvin: 4000, brandText: null });

  const { specGaps } = await getAnalyticsTiles(db);
  expect(specGaps.map((g) => g.field)).toEqual([
    "quantity",
    "kelvin",
    "watt",
    "lumen",
    "brand",
  ]);
  const byField = Object.fromEntries(specGaps.map((g) => [g.field, g.missing]));
  expect(byField).toEqual({ quantity: 2, kelvin: 1, watt: 2, lumen: 2, brand: 2 });
  expect(specGaps.every((g) => g.total === 3)).toBe(true);
});

// ── 6. searchHealth ──────────────────────────────────────────────────────────
test("searchHealth: ontdubbeld op query-tekst, ruis eruit, gemengde uitkomst telt niet mee", async () => {
  const db = await createTestDb();
  // dezelfde geslaagde zoekactie twee keer: één unieke query
  await seedEvent(db, { action: "search", payload: { query: "SASSO", resultCount: 5 } });
  await seedEvent(db, { action: "search", payload: { query: "SASSO", resultCount: 5 } });
  // drie keer herhaald én altijd leeg: één unieke query, één mislukking
  for (let i = 0; i < 3; i++) {
    await seedEvent(db, { action: "search", payload: { query: "i40", resultCount: 0 } });
  }
  await seedEvent(db, { action: "search", payload: { query: "ORIONNOVA", resultCount: 0 } });
  // de kern: één keer 0, één keer 8 → de zoekterm wérkt, dus géén mislukte zoekactie
  await seedEvent(db, { action: "search", payload: { query: "downlight", resultCount: 0 } });
  await seedEvent(db, { action: "search", payload: { query: "downlight", resultCount: 8 } });
  // ruis: ZZTEST-rooktest en een lege query tellen niet mee
  await seedEvent(db, { action: "search", payload: { query: "ZZTEST-abc", resultCount: 0 } });
  await seedEvent(db, { action: "search", payload: { query: "", resultCount: 0 } });
  // resultCount ontbreekt: telt wél als zoekactie, niet als "zonder resultaat"
  await seedEvent(db, { action: "search", payload: { query: "zonder telling" } });
  // half geteld: één 0 plus één event zonder telling → niet aantoonbaar altijd leeg
  await seedEvent(db, { action: "search", payload: { query: "half geteld", resultCount: 0 } });
  await seedEvent(db, { action: "search", payload: { query: "half geteld" } });

  const { searchHealth } = await getAnalyticsTiles(db);
  // ruw zouden dit 11 zoekacties met 6 nullen zijn; ontdubbeld: 6 query's, 2 mislukt
  expect(searchHealth).toEqual({ total: 6, withoutResults: 2 });
});

// ── 7. brandsNotInCatalogue ──────────────────────────────────────────────────
test("brandsNotInCatalogue: alleen merken zonder product, ruimtenamen blijven zichtbaar", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });
  const dossierId = await seedDossier(db);
  await seedSpecLine(db, dossierId, { brandText: "XAL" }); // bestaat → niet in de lijst
  await seedSpecLine(db, dossierId, { brandText: "xal" }); // case-insensitieve match
  await seedSpecLine(db, dossierId, { brandText: "Trilux" });
  await seedSpecLine(db, dossierId, { brandText: "Trilux" });
  await seedSpecLine(db, dossierId, { brandText: "Woonkamer" }); // vervuiling: blijft staan
  await seedSpecLine(db, dossierId, { brandText: "" });

  const { brandsNotInCatalogue } = await getAnalyticsTiles(db);
  expect(brandsNotInCatalogue).toEqual([
    { brand: "Trilux", lines: 2 },
    { brand: "Woonkamer", lines: 1 },
  ]);
});

// ── 8. brandLoadQueue ────────────────────────────────────────────────────────
test("brandLoadQueue: gewogen op frequentie, aflopend", async () => {
  const db = await createTestDb();
  await db.insert(brandLoadQueue).values([
    { brandKey: "bega", displayName: "BEGA", frequency: 16 },
    { brandKey: "philips", displayName: "Philips", frequency: 8 },
  ]);

  const { brandLoadQueue: queue } = await getAnalyticsTiles(db);
  expect(queue).toEqual([
    { brand: "BEGA", demand: 16, status: "wachtend" },
    { brand: "Philips", demand: 8, status: "wachtend" },
  ]);
});

// ── 9. unmetDemand ───────────────────────────────────────────────────────────
test("unmetDemand: zoekopdrachten met 0 resultaten, gegroepeerd per query", async () => {
  const db = await createTestDb();
  await seedEvent(db, { action: "search", payload: { query: "INFINITE PRO", resultCount: 0 } });
  await seedEvent(db, { action: "search", payload: { query: "INFINITE PRO", resultCount: 0 } });
  await seedEvent(db, { action: "search", payload: { query: "i40", resultCount: 0 } });
  await seedEvent(db, { action: "search", payload: { query: "SASSO", resultCount: 3 } });
  await seedEvent(db, { action: "search", payload: { query: "ZZTEST-x", resultCount: 0 } });

  const { unmetDemand } = await getAnalyticsTiles(db);
  expect(unmetDemand).toEqual([
    { query: "INFINITE PRO", count: 2 },
    { query: "i40", count: 1 },
  ]);
});

// ── 10. projects ─────────────────────────────────────────────────────────────
test("projects: telt dossiers, offertes, offerteregels en spec-regels", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db, "Raadhuis");
  await seedDossier(db, "Tweede project");
  await seedSpecLine(db, dossierId);
  await seedSpecLine(db, dossierId);
  const [quote] = await db
    .insert(quotes)
    .values({ dossierId, quoteNumber: "BL-2026-0001" })
    .returning({ id: quotes.id });
  await db.insert(quoteLines).values({
    quoteId: quote.id,
    productName: "SASSO 100 SQ",
    fixtureCode: "Lp301",
    quantity: 2,
    unitPrice: "100.00",
    lineTotal: "200.00",
  });

  const { projects } = await getAnalyticsTiles(db);
  expect(projects).toEqual({ dossiers: 2, quotes: 1, quoteLines: 1, specLines: 2 });
});

// ── randen ───────────────────────────────────────────────────────────────────
test("lege database: overal een lege lijst en nul, nooit een throw", async () => {
  const db = await createTestDb();
  const t = await getAnalyticsTiles(db);

  expect(t.period).toEqual({
    from: null,
    to: null,
    totalEvents: 0,
    actors: 0,
    activeDays: 0,
  });
  expect(t.consideredProducts).toEqual([]);
  expect(t.statusSplit).toEqual([]);
  expect(t.breakdown).toEqual([]);
  expect(t.specGaps).toEqual([]);
  expect(t.searchHealth).toEqual({ total: 0, withoutResults: 0 });
  expect(t.brandsNotInCatalogue).toEqual([]);
  expect(t.brandLoadQueue).toEqual([]);
  expect(t.unmetDemand).toEqual([]);
  expect(t.projects).toEqual({ dossiers: 0, quotes: 0, quoteLines: 0, specLines: 0 });
});

test("uuid-guard: een event met een kapotte productId-payload wordt overgeslagen", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });
  await seedEvent(db, {
    action: "product_considered",
    payload: { productId, list: "aantoonbaar" },
  });
  await seedEvent(db, {
    action: "product_considered",
    payload: { productId: "geen-uuid", list: "aantoonbaar" },
  });
  await seedEvent(db, { action: "product_considered", payload: { list: "aantoonbaar" } });

  const { consideredProducts } = await getAnalyticsTiles(db);
  expect(consideredProducts).toEqual([
    { brand: "XAL", name: "SASSO 100 SQ", list: "aantoonbaar", count: 1 },
  ]);
});

test("orgId scopet: alleen de regels en events van dossiers van die organisatie", async () => {
  const db = await createTestDb();
  // project_dossiers.org_id draagt in de migratie een FK naar organizations (het schema in
  // db/schema.ts noemt die referentie niet) — de org moet dus echt bestaan.
  const [org] = await db
    .insert(organizations)
    .values({ name: "Installatiebedrijf X", slug: "x" })
    .returning({ id: organizations.id });
  const orgId = org.id;
  const eigen = await seedDossier(db, "Org-project", orgId);
  const intern = await seedDossier(db, "Brink-project", null);

  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });
  const eigenLijn = await seedSpecLine(db, eigen, { brandText: "Trilux" });
  const internLijn = await seedSpecLine(db, intern, { brandText: "Trilux" });

  for (const entityId of [eigenLijn, internLijn]) {
    await seedEvent(db, {
      action: "product_considered",
      entityId,
      payload: { productId, list: "aantoonbaar" },
    });
    await seedEvent(db, { action: "matched_status", entityId, payload: { status: "blauw" } });
    await seedEvent(db, {
      action: "search",
      entityId,
      payload: { query: "i40", resultCount: 0 },
    });
  }
  // één zoekactie die alléén intern bestaat: zonder deze regel zou de ontdubbelde
  // searchHealth voor "alles" en "gescoped" toevallig gelijk zijn (beide één keer "i40").
  await seedEvent(db, {
    action: "search",
    entityId: internLijn,
    payload: { query: "orionnova", resultCount: 0 },
  });
  await db.insert(brandLoadQueue).values({
    brandKey: "trilux",
    displayName: "Trilux",
    frequency: 4,
  });

  const alles = await getAnalyticsTiles(db);
  const gescoped = await getAnalyticsTiles(db, { orgId });

  expect(alles.consideredProducts[0].count).toBe(2);
  expect(gescoped.consideredProducts[0].count).toBe(1);
  expect(alles.statusSplit[0].count).toBe(2);
  expect(gescoped.statusSplit[0].count).toBe(1);
  expect(alles.searchHealth).toEqual({ total: 2, withoutResults: 2 });
  expect(gescoped.searchHealth).toEqual({ total: 1, withoutResults: 1 });
  expect(alles.unmetDemand).toEqual([
    { query: "i40", count: 2 },
    { query: "orionnova", count: 1 },
  ]);
  expect(gescoped.unmetDemand).toEqual([{ query: "i40", count: 1 }]);
  expect(alles.brandsNotInCatalogue).toEqual([{ brand: "Trilux", lines: 2 }]);
  expect(gescoped.brandsNotInCatalogue).toEqual([{ brand: "Trilux", lines: 1 }]);
  expect(alles.projects).toMatchObject({ dossiers: 2, specLines: 2 });
  expect(gescoped.projects).toMatchObject({ dossiers: 1, specLines: 1 });
  // de meetperiode scopet mee: eventvolume is een platformbreed bedrijfscijfer van Brink en
  // mag niet via deze tegel bij één organisatie terechtkomen
  expect(alles.period.totalEvents).toBe(7);
  expect(gescoped.period.totalEvents).toBe(3);
  // brand_load_queue heeft geen dossierrelatie → met een orgId bewust leeg
  expect(alles.brandLoadQueue).toHaveLength(1);
  expect(gescoped.brandLoadQueue).toEqual([]);
});

test("minEventsPerWeek: een product met 3 events valt weg bij een grens van 5", async () => {
  const db = await createTestDb();
  const klein = await seedBrandProduct(db, { brand: "ETAP", name: "U7" });
  const groot = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });

  for (let i = 0; i < 3; i++) {
    await seedEvent(db, {
      action: "product_considered",
      payload: { productId: klein.productId, list: "aantoonbaar" },
      createdAt: dag("2026-07-06"),
    });
  }
  // 6 events, maar verdeeld over twee ISO-weken (3 + 3) → haalt de grens ook niet
  for (let i = 0; i < 3; i++) {
    await seedEvent(db, {
      action: "product_considered",
      payload: { productId: klein.productId, list: "aantoonbaar" },
      createdAt: dag("2026-07-13"),
    });
  }
  for (let i = 0; i < 5; i++) {
    await seedEvent(db, {
      action: "product_considered",
      payload: { productId: groot.productId, list: "aantoonbaar" },
      createdAt: dag("2026-07-06"),
    });
  }

  const zonderGrens = await getAnalyticsTiles(db);
  expect(zonderGrens.consideredProducts.map((r) => r.name).sort()).toEqual([
    "SASSO 100 SQ",
    "U7",
  ]);

  const metGrens = await getAnalyticsTiles(db, { minEventsPerWeek: 5 });
  expect(metGrens.consideredProducts).toEqual([
    { brand: "XAL", name: "SASSO 100 SQ", list: "aantoonbaar", count: 5 },
  ]);

  // orgId + grens tegelijk is de enige combinatie waarin de weekgrens zélf gescoped wordt;
  // hier draagt geen event een entity_id, dus de gescopte lijst is per definitie leeg.
  const [org] = await db
    .insert(organizations)
    .values({ name: "Installatiebedrijf X", slug: "x" })
    .returning({ id: organizations.id });
  const beide = await getAnalyticsTiles(db, { orgId: org.id, minEventsPerWeek: 5 });
  expect(beide.consideredProducts).toEqual([]);
});

test("period: een organisatie zonder events krijgt een lege meetperiode", async () => {
  const db = await createTestDb();
  const [leeg] = await db
    .insert(organizations)
    .values({ name: "Nog geen dossiers", slug: "leeg" })
    .returning({ id: organizations.id });
  const dossierId = await seedDossier(db, "Brink-project", null);
  const lijn = await seedSpecLine(db, dossierId);
  await seedEvent(db, { action: "search", entityId: lijn, actor: "timo" });
  await seedEvent(db, { action: "match", entityId: lijn, actor: "eduard" });

  const intern = await getAnalyticsTiles(db);
  expect(intern.period.totalEvents).toBe(2);
  expect(intern.period.actors).toBe(2);

  // Zonder scope zou deze organisatie Brinks platformbrede volume en interne bezetting zien,
  // terwijl elke andere tegel bij haar 0 toont.
  const { period } = await getAnalyticsTiles(db, { orgId: leeg.id });
  expect(period).toEqual({
    from: null,
    to: null,
    totalEvents: 0,
    actors: 0,
    activeDays: 0,
  });
});

// De CASE-guard rond jsonb_array_elements: een kale coalesce(deviations,'[]') dekt alleen SQL
// NULL. Een jsonb-scalar 'null' of een object glipt daar doorheen en laat Postgres gooien met
// "cannot extract elements from a scalar" — één zo'n spec-regel zou de hele pagina slopen.
test("breakdown: een deviations die geen array is (jsonb 'null', object) breekt de tegel niet", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);
  await seedSpecLine(db, dossierId, {
    deviations: [{ field: "kelvin", requested: 3000, delivered: 2700, verdict: "groen" }],
  });
  // jsonb 'null' (niet SQL NULL) — alleen via ruwe SQL te zetten
  await db
    .insert(specLines)
    .values({ dossierId, fixtureCode: "Lp302", deviations: sql`'null'::jsonb` });
  // en een object waar een array hoort
  await db
    .insert(specLines)
    .values({ dossierId, fixtureCode: "Lp303", deviations: sql`'{"field":"cri"}'::jsonb` });

  const { breakdown } = await getAnalyticsTiles(db);
  expect(breakdown).toEqual([{ field: "kelvin", verdict: "groen", count: 1 }]);
});

test("minEventsPerWeek faalt dicht: een niet-numerieke grens zet de anonimisering niet uit", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });
  for (let i = 0; i < 5; i++) {
    await seedEvent(db, {
      action: "product_considered",
      payload: { productId, list: "aantoonbaar" },
      createdAt: dag("2026-07-06"),
    });
  }

  // Zonder grens zichtbaar; met een kapotte grens (besluit 12) juist niet — NaN mag niet
  // stilzwijgend "geen grens" betekenen, zoals een kapotte orgId ook dichtscopet.
  expect((await getAnalyticsTiles(db)).consideredProducts).toHaveLength(1);
  expect(
    (await getAnalyticsTiles(db, { minEventsPerWeek: Number.NaN })).consideredProducts,
  ).toEqual([]);
  expect(
    (await getAnalyticsTiles(db, { minEventsPerWeek: Number.POSITIVE_INFINITY }))
      .consideredProducts,
  ).toEqual([]);
});

test("een orgId die geen uuid is scopet dicht i.p.v. de pagina te breken", async () => {
  const db = await createTestDb();
  const dossierId = await seedDossier(db);
  await seedSpecLine(db, dossierId, { brandText: "Trilux" });

  const kapot = await getAnalyticsTiles(db, { orgId: "geen-uuid" });
  expect(kapot.brandsNotInCatalogue).toEqual([]);
  expect(kapot.projects).toEqual({ dossiers: 0, quotes: 0, quoteLines: 0, specLines: 0 });
});
