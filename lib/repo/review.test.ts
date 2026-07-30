// Review-beslissingen (stap 7, herontwerp 2026-07-14): élke bevestigende keuze maakt
// de regel GROEN met merkteken "handmatig gekozen" (chosenBy = actor op de kandidaat);
// de oorspronkelijke afwijkingen blijven als notitie staan. Afwijzen blijft → rood.
// Plus: handmatig linken op rood (menshandeling, ijzeren regel 4) en de badge-telling
// die rode ongematchte regels als wachtend meetelt.
import { expect, test } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  events,
  importRuns,
  ocrPageImages,
  projectDossiers,
  specLineCandidates,
  specLines,
  type ImportRow,
} from "@/db/schema";
import { addProductToBrand, createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { runMatcher } from "@/lib/repo/matching";
import {
  decideReview,
  flagForReview,
  getReviewCounts,
  getRedLinkLines,
  getReviewQueue,
  linkManualProduct,
} from "@/lib/repo/review";

const ACTOR = "eduard@brinklicht.nl";

// Twee schone gele kandidaten (watt 14 op gevraagd 12 = 16,7% → geel; kelvin exact):
// precies het geval waar B3/auto-door NIET vuurt (meerdere kandidaten) en de regel
// dus met reviewKind 'geel' in de wachtrij komt.
async function seedTwoCleanYellow() {
  const db = await createTestDb();
  const { brandId, priceListId, productId: p600 } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 3000,
    maxWattage: 14,
  });
  const { productId: p900 } = await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "VELA ROUND 900",
    kelvin: 3000,
    maxWattage: 14,
  });
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Review" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lk410",
      brandText: "XAL",
      productText: "VELA ROUND",
      reqWatt: "12",
      reqKelvin: 3000,
    })
    .returning();
  await runMatcher(db as TestDb, line.id, "tester");
  return { db, dossierId: dossier.id, lineId: line.id, brandId, priceListId, p600, p900 };
}

async function getLine(db: TestDb, id: string) {
  const [row] = await db.select().from(specLines).where(eq(specLines.id, id));
  return row;
}

async function chosenCandidates(db: TestDb, lineId: string) {
  return db
    .select()
    .from(specLineCandidates)
    .where(
      and(eq(specLineCandidates.specLineId, lineId), eq(specLineCandidates.chosen, true)),
    );
}

test("accepteer → groen + merkteken: voorstel-kandidaat (rank 1) gekozen, deviations blijven", async () => {
  const s = await seedTwoCleanYellow();
  const before = await getLine(s.db, s.lineId);
  expect(before.status).toBe("geel");
  expect(before.reviewKind).toBe("geel"); // twee kandidaten → geen auto-door
  expect(before.matchedProductId).toBeNull();

  await decideReview(s.db, { specLineId: s.lineId, decision: "accepteer", actor: ACTOR });

  const [rank1] = await s.db
    .select()
    .from(specLineCandidates)
    .where(eq(specLineCandidates.specLineId, s.lineId))
    .orderBy(asc(specLineCandidates.rank))
    .limit(1);

  const after = await getLine(s.db, s.lineId);
  // bewust besluit herontwerp 2026-07-14: accepteren maakt de regel groen (was: bleef geel)
  expect(after.status).toBe("groen");
  expect(after.matchedProductId).toBe(rank1.productId);
  // de oorspronkelijke afwijkingen blijven als notitie zichtbaar (C-07)
  expect(after.deviations?.some((d) => d.field === "watt" && d.verdict === "geel")).toBe(true);
  expect(after.reviewedAt).not.toBeNull();
  expect(after.reviewDecision).toBe("accepteer");

  const chosen = await chosenCandidates(s.db, s.lineId);
  expect(chosen.length).toBe(1);
  expect(chosen[0].productId).toBe(rank1.productId);
  expect(chosen[0].chosenBy).toBe(ACTOR); // menskeuze → merkteken "handmatig gekozen"

  const evts = await s.db.select().from(events).where(eq(events.action, "review_decided"));
  expect(evts.length).toBe(1);
  expect((evts[0].payload as { productId: string }).productId).toBe(rank1.productId);
});

test("N-keuze: accepteer mét productId kiest die kandidaat → groen + merkteken", async () => {
  const s = await seedTwoCleanYellow();
  // kies expliciet de ándere kandidaat (VELA ROUND 900)
  await decideReview(s.db, {
    specLineId: s.lineId,
    decision: "accepteer",
    productId: s.p900,
    actor: ACTOR,
  });

  const after = await getLine(s.db, s.lineId);
  expect(after.status).toBe("groen");
  expect(after.matchedProductId).toBe(s.p900);

  const chosen = await chosenCandidates(s.db, s.lineId);
  expect(chosen.length).toBe(1);
  expect(chosen[0].productId).toBe(s.p900);
  expect(chosen[0].chosenBy).toBe(ACTOR);
});

test("variant mét productId → groen + matched; onbekende zuster krijgt kandidaat-record", async () => {
  const s = await seedTwoCleanYellow();
  // een zichtbare zustervariant die NIET in spec_line_candidates zit
  const { productId: sister } = await addProductToBrand(s.db, {
    brandId: s.brandId,
    priceListId: s.priceListId,
    name: "VELA ROUND 600 BLACK",
    kelvin: 3000,
    maxWattage: 14,
  });
  await flagForReview(s.db, s.lineId, "variant");

  await decideReview(s.db, {
    specLineId: s.lineId,
    decision: "variant",
    productId: sister,
    variantColor: "black",
    actor: ACTOR,
  });

  const after = await getLine(s.db, s.lineId);
  expect(after.status).toBe("groen");
  expect(after.matchedProductId).toBe(sister);
  expect(after.reqColor).toBe("black");
  expect(after.reviewDecision).toBe("variant");

  const chosen = await chosenCandidates(s.db, s.lineId);
  expect(chosen.length).toBe(1);
  expect(chosen[0].productId).toBe(sister);
  expect(chosen[0].chosenBy).toBe(ACTOR);
  // niet door de tolerantietabel getoetst → eerlijk in lijst 'onvolledig' (C-08)
  expect(chosen[0].list).toBe("onvolledig");
  expect(chosen[0].chosenReason).toBe("kleurvariant gekozen in review");
});

// Server-side guard (reviewer-bevinding): een expliciet productId uit het formulier
// moet een nú zichtbaar product zijn — verzonnen of onzichtbaar id → weigeren, en de
// regel blijft volledig ongewijzigd (zelfde guard als linkManualProduct).
test("decideReview weigert een verzonnen of onzichtbaar productId, regel ongewijzigd", async () => {
  const s = await seedTwoCleanYellow();
  // verzonnen id bij 'accepteer'
  await expect(
    decideReview(s.db, {
      specLineId: s.lineId,
      decision: "accepteer",
      productId: crypto.randomUUID(),
      actor: ACTOR,
    }),
  ).rejects.toThrow(/not visible/);
  // onzichtbaar product (zelfde merk, geen geldige prijs) bij 'variant'
  const schema = await import("@/db/schema");
  const invisible = crypto.randomUUID();
  await s.db.insert(schema.products).values({
    id: invisible,
    name: "VELA ROUND 600 BLACK",
    brandId: s.brandId,
    brandName: "XAL",
  });
  await flagForReview(s.db, s.lineId, "variant");
  await expect(
    decideReview(s.db, {
      specLineId: s.lineId,
      decision: "variant",
      productId: invisible,
      variantColor: "black",
      actor: ACTOR,
    }),
  ).rejects.toThrow(/not visible/);

  // de regel is in beide gevallen onaangeroerd gebleven
  const after = await getLine(s.db, s.lineId);
  expect(after.status).toBe("geel");
  expect(after.matchedProductId).toBeNull();
  expect(after.reviewedAt).toBeNull();
  expect(after.reviewDecision).toBeNull();
  expect(after.reqColor).toBeNull();
  expect((await chosenCandidates(s.db, s.lineId)).length).toBe(0);
});

test("afwijzen blijft → rood, reden verplicht, geen match gezet", async () => {
  const s = await seedTwoCleanYellow();
  await expect(
    decideReview(s.db, { specLineId: s.lineId, decision: "afgewezen", actor: ACTOR }),
  ).rejects.toThrow(/Reason required/);

  await decideReview(s.db, {
    specLineId: s.lineId,
    decision: "afgewezen",
    reason: "klant accepteert geen hoger vermogen",
    actor: ACTOR,
  });
  const after = await getLine(s.db, s.lineId);
  expect(after.status).toBe("rood");
  expect(after.matchedProductId).toBeNull();
  expect(after.noMatchReason).toContain("hoger vermogen");
  expect((await chosenCandidates(s.db, s.lineId)).length).toBe(0);
});

// Reviewer-bevinding: een afgewezen gele regel (reviewKind blijft staan, reviewedAt
// gezet, status rood zonder match) mag NIET dubbel op de reviewpagina verschijnen —
// alleen in "Afgerond", niet in de rood-linksectie; en de badge telt hem niet als
// wachtend. Een verse rode regel (zonder reviewKind) hoort wél in de rood-sectie.
test("afgewezen regel staat alleen in Afgerond — niet in de rood-sectie, niet als wachtend", async () => {
  const s = await seedTwoCleanYellow();
  await decideReview(s.db, {
    specLineId: s.lineId,
    decision: "afgewezen",
    reason: "klant accepteert geen hoger vermogen",
    actor: ACTOR,
  });

  // alleen in "Afgerond" (review-wachtrij), niet in de rood-linksectie
  const { pending, done } = await getReviewQueue(s.db, s.dossierId);
  expect(pending.length).toBe(0);
  expect(done.map((d) => d.id)).toEqual([s.lineId]);
  expect(await getRedLinkLines(s.db, s.dossierId)).toEqual([]);

  // badge: het besluit is genomen — niet eeuwig 'wachtend', wel in het totaal
  const counts = await getReviewCounts(s.db, s.dossierId);
  expect(counts.pending).toBe(0);
  expect(counts.total).toBe(1);

  // een VERSE rode regel (geen reviewKind) telt wél als werkvoorraad
  const [fresh] = await s.db
    .insert(specLines)
    .values({
      dossierId: s.dossierId,
      fixtureCode: "Lr999",
      brandText: "XAL",
      productText: "PHANTOMDELUXE ZX9000",
      status: "rood",
    })
    .returning();
  expect((await getRedLinkLines(s.db, s.dossierId)).map((r) => r.id)).toEqual([
    fresh.id,
  ]);
  expect((await getReviewCounts(s.db, s.dossierId)).pending).toBe(1);
});

// B7-versoepeling (bouwstap 4, reviewer-2): een rode OCR-regel met een ÁFGERONDE
// ocr-review ("Goed" in het deck — de lezing klopt, maar er is nog geen match) valt
// terug in de rood-werkvoorraad en telt als wachtend. Zolang de ocr-review open
// staat hoort hij alleen in de review-wachtrij (niet dubbel).
test("rode OCR-regel: open review → alleen wachtrij; afgeronde review → rood-sectie", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "OCR rood" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lo501",
      brandText: "XAL",
      productText: "FANTOOM 9000",
      source: "ocr",
      status: "rood",
      reviewKind: "ocr",
    })
    .returning();

  // Open ocr-review: wél in de review-wachtrij, NIET (ook) in de rood-sectie.
  expect((await getReviewQueue(db, dossier.id)).pending.map((p) => p.id)).toEqual([
    line.id,
  ]);
  expect(await getRedLinkLines(db, dossier.id)).toEqual([]);
  expect((await getReviewCounts(db, dossier.id)).pending).toBe(1);

  // "Goed" in het deck ('gecontroleerd' is status-neutraal): lezing bevestigd,
  // regel blijft rood zonder match → terug in de rood-werkvoorraad + badge.
  await decideReview(db, {
    specLineId: line.id,
    decision: "gecontroleerd",
    actor: ACTOR,
  });
  const after = await getRedLinkLines(db, dossier.id);
  expect(after.map((r) => r.id)).toEqual([line.id]);
  const counts = await getReviewCounts(db, dossier.id);
  expect(counts.pending).toBe(1); // nog steeds werkvoorraad: handmatig linken
  expect(counts.total).toBe(1);

  // Wordt de lezing juist AFGEWEZEN, dan is het een genomen besluit — geen
  // werkvoorraad meer (zelfde regel als de afgewezen gele regel hierboven).
  const [rejected] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lo502",
      source: "ocr",
      status: "rood",
      reviewKind: "ocr",
    })
    .returning();
  await decideReview(db, {
    specLineId: rejected.id,
    decision: "afgewezen",
    reason: "verkeerd gelezen — regel bestaat niet",
    actor: ACTOR,
  });
  expect((await getRedLinkLines(db, dossier.id)).map((r) => r.id)).toEqual([
    line.id,
  ]);
  expect((await getReviewCounts(db, dossier.id)).pending).toBe(1);
});

// Rood → handmatig linken: menshandeling (zoeken + klikken), regel wordt groen met
// merkteken, event manual_link, en de regel verdwijnt uit de link-werkvoorraad.
test("linkManualProduct: rood → groen + merkteken + manual_link-event + telling zakt", async () => {
  const db = await createTestDb();
  const { brandId, priceListId, productId: similar } = await seedBrandProduct(db, {
    brand: "Flos",
    name: "Bellhop Glass C2",
  });
  void brandId;
  void priceListId;
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Rood linken" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lr701",
      brandText: "Flos",
      productText: "ORIONNOVA QX5",
    })
    .returning();
  await runMatcher(db as TestDb, line.id, "tester");

  const before = await getLine(db, line.id);
  expect(before.status).toBe("rood"); // merk wél, product niet
  expect((await getRedLinkLines(db, dossier.id)).map((r) => r.id)).toEqual([line.id]);
  // badge-telling (bewust besluit): rood zonder match telt als wachtend
  expect((await getReviewCounts(db, dossier.id)).pending).toBe(1);

  await linkManualProduct(db, { specLineId: line.id, productId: similar, actor: ACTOR });

  const after = await getLine(db, line.id);
  expect(after.status).toBe("groen");
  expect(after.matchedProductId).toBe(similar);
  expect(after.noMatchReason).toBeNull();

  const chosen = await chosenCandidates(db, line.id);
  expect(chosen.length).toBe(1);
  expect(chosen[0].chosenBy).toBe(ACTOR);
  expect(chosen[0].chosenReason).toBe("vergelijkbaar product handmatig gelinkt");

  const evts = await db.select().from(events).where(eq(events.action, "manual_link"));
  expect(evts.length).toBe(1);
  expect((evts[0].payload as { productId: string }).productId).toBe(similar);

  // gelinkt → uit de werkvoorraad én uit de badge
  expect(await getRedLinkLines(db, dossier.id)).toEqual([]);
  expect((await getReviewCounts(db, dossier.id)).pending).toBe(0);
});

test("linkManualProduct weigert een niet-zichtbaar product (regel 3)", async () => {
  const db = await createTestDb();
  const { brandId } = await seedBrandProduct(db, { brand: "Flos", name: "Bellhop" });
  // product van hetzelfde merk ZONDER geldige prijs(lijst) → onzichtbaar in
  // visible_products (verlopen/ontbrekende prijslijst = product bestaat niet)
  const schema = await import("@/db/schema");
  const invisible = crypto.randomUUID();
  await db.insert(schema.products).values({
    id: invisible,
    name: "Bellhop OLD",
    brandId,
    brandName: "Flos",
  });
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Onzichtbaar" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({ dossierId: dossier.id, fixtureCode: "Lx1", status: "rood" })
    .returning();

  await expect(
    linkManualProduct(db, { specLineId: line.id, productId: invisible, actor: ACTOR }),
  ).rejects.toThrow(/not visible/);
});

// UX-audit 30 jul, bug #2: de OCR-kaart linkt naar /ocr-image/<run>/<page> — een
// PAGINA-resource. De vlag in de wachtrijquery keek alleen of de RUN érgens beelden
// had, dus een run met gedeeltelijke beelddekking (een vision-fout of budgetstop
// haalt de beeldrij van een mislukte pagina weer weg) liet de link óók renderen op
// kaarten wier eigen source_page geen beeld heeft → kale 404. Deze test pint de
// per-pagina-correlatie én dat de vlag een échte boolean is (geen 't'/'f'-string).
// Tweede helft: de kaart moet de ruwe tabelregel kunnen tonen — die komt uit
// import_runs.rows (ImportRow.rawText) van de eigen run.
async function seedOcrRunMetHalveBeelddekking() {
  const db = await createTestDb();
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "OCR-beelddekking" })
    .returning();
  const rows: ImportRow[] = [
    {
      fixtureCode: "Ld105",
      quantity: null,
      brandText: "XAL",
      productText: "UNICO Q4",
      source: "ocr",
      rawText: "Ld105  XAL  UNICO Q4 2700K  IP20  9W",
      page: 3,
      checked: true,
    },
    {
      fixtureCode: "Ld106",
      quantity: null,
      brandText: "XAL",
      productText: "UNICO Q4",
      source: "ocr",
      rawText: "Ld106  XAL  UNICO Q4 3000K  IP20  9W",
      page: 7,
      checked: true,
    },
  ];
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: dossier.id,
      source: "ocr",
      status: "bevestigd",
      ocrStatus: "gestopt",
      rows,
    })
    .returning();
  // Alléén pagina 3 heeft een beeldrij — pagina 7 verloor die (vision-fout).
  await db.insert(ocrPageImages).values({
    importRunId: run.id,
    page: 3,
    mime: "image/jpeg",
    width: 1568,
    height: 1109,
    bytes: new Uint8Array([1, 2, 3]),
  });
  const gemaakt = await db
    .insert(specLines)
    .values(
      [3, 7].map((page, i) => ({
        dossierId: dossier.id,
        fixtureCode: i === 0 ? "Ld105" : "Ld106",
        brandText: "XAL",
        productText: "UNICO Q4",
        source: "ocr" as const,
        sourcePage: page,
        importRunId: run.id,
        reviewKind: "ocr" as const,
        sortOrder: i,
      })),
    )
    .returning();
  return { db, dossierId: dossier.id, runId: run.id, lines: gemaakt };
}

test("wachtrij: paginabeeld-vlag is per PAGINA, niet per run (geen link naar een 404)", async () => {
  const s = await seedOcrRunMetHalveBeelddekking();
  const { pending } = await getReviewQueue(s.db, s.dossierId);
  const metBeeld = pending.find((r) => r.sourcePage === 3);
  const zonderBeeld = pending.find((r) => r.sourcePage === 7);

  // Echte booleans (niet 't'/'f'): de UI test op `!== false`, dus dat moet hard zijn.
  expect(metBeeld?.hasPageImage).toBe(true);
  expect(zonderBeeld?.hasPageImage).toBe(false);
});

test("wachtrij: OCR-regel draagt zijn ruwe brontekst uit import_runs.rows", async () => {
  const s = await seedOcrRunMetHalveBeelddekking();
  const { pending } = await getReviewQueue(s.db, s.dossierId);
  expect(pending.find((r) => r.fixtureCode === "Ld105")?.sourceText).toBe(
    "Ld105  XAL  UNICO Q4 2700K  IP20  9W",
  );
  expect(pending.find((r) => r.fixtureCode === "Ld106")?.sourceText).toBe(
    "Ld106  XAL  UNICO Q4 3000K  IP20  9W",
  );
});

test("wachtrij: niet-OCR-regels vragen de brontekst niet op (blijft null)", async () => {
  const s = await seedTwoCleanYellow();
  const { pending } = await getReviewQueue(s.db, s.dossierId);
  expect(pending.length).toBe(1);
  expect(pending[0].reviewKind).toBe("geel");
  expect(pending[0].sourceText).toBeNull();
  // Zonder import_run_id is er ook geen paginabeeld.
  expect(pending[0].hasPageImage).toBe(false);
});
