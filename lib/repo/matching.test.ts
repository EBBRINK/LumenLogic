// Matching-kwaliteit (frisse-ogen-review): het echte armatuur hoort boven zijn
// accessoires te staan, en de CSV-plak mag een meegeplakte kolomkop niet importeren.
// Plus B3 (geel auto-door): de persistente kant van runMatcher — auto-accepteren van
// de ondubbelzinnige bijna-match, en het bewaren van niet-gele review-flags bij hermatch.
import { expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { events, projectDossiers, specLineCandidates, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { parseSpecCsv } from "@/lib/repo/dossiers";
import { runMatcher } from "@/lib/repo/matching";
import { searchProducts } from "@/lib/repo/products";

test("armatuur rankt boven accessoire dat de familienaam middenin noemt", async () => {
  const db = await createTestDb();
  // accessoire noemt "SASSO 100" middenin — matchte vroeger bovenaan door trigram-sim
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SNOOT LONG 100 FOR SASSO 100 / KARO 100",
    price: "16.00",
  });
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 17,9W cob LED 3000K 220-240V",
    price: "310.00",
  });

  const hits = await searchProducts(db, { query: "SASSO 100", brand: "XAL" });
  expect(hits.length).toBeGreaterThanOrEqual(2);
  // prefix-bonus: het armatuur (naam begint met de zoektekst) wint — óók al is het duurder,
  // want prijs zit nergens in de ordening (regel 2)
  expect(hits[0].name).toContain("SASSO 100 SQ SP CEIL");
  expect(hits[1].name).toContain("SNOOT");
});

test("CSV-plak slaat een meegeplakte kolomkop over", () => {
  const lines = parseSpecCsv(
    "code, aantal, merk, type\nLp301, 12, XAL, SASSO 100\nArmatuurcode; 1; x; y\nLw201, 8, Wever & Ducré, SCAVA 1.0",
  );
  expect(lines.map((l) => l.fixtureCode)).toEqual(["Lp301", "Lw201"]);
  expect(lines[0]).toMatchObject({ quantity: 12, brandText: "XAL", productText: "SASSO 100" });
});

// ── B3: geel auto-door — de persistente kant (runMatcher) ─────────────────────

// Eén schoon-gele kandidaat in de catalogus: watt 14 op gevraagd 12 (16,7% → geel),
// kelvin exact. Geen keuzeveld-afwijking → komt in aanmerking voor auto-door.
async function seedAutoDoorLine(db: TestDb, extra: Partial<typeof specLines.$inferInsert> = {}) {
  const { productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 3000,
    maxWattage: 14,
  });
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Auto-door" })
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
      ...extra,
    })
    .returning();
  return { productId, line };
}

test("b3 auto-door: matched gezet, kandidaat chosen system:auto, reviewKind null, event gelogd", async () => {
  const db = await createTestDb();
  const { productId, line } = await seedAutoDoorLine(db);

  const outcome = await runMatcher(db as TestDb, line.id, "tester");
  expect(outcome.status).toBe("geel");
  expect(outcome.unambiguousYellow?.productId).toBe(productId);

  // de regel: match gezet, GEEN review-wachtrij, status blijft eerlijk geel
  const [saved] = await db.select().from(specLines).where(eq(specLines.id, line.id));
  expect(saved.matchedProductId).toBe(productId);
  expect(saved.reviewKind).toBeNull();
  expect(saved.status).toBe("geel");
  // de afwijkingsnotitie staat op de regel (transparantie, C-07)
  expect(saved.deviations?.some((d) => d.field === "watt" && d.verdict === "geel")).toBe(true);

  // de kandidaat: zelfde velden als chooseCandidate, maar door het systeem
  const [cand] = await db
    .select()
    .from(specLineCandidates)
    .where(
      and(
        eq(specLineCandidates.specLineId, line.id),
        eq(specLineCandidates.chosen, true),
      ),
    );
  expect(cand?.productId).toBe(productId);
  expect(cand?.chosenBy).toBe("system:auto");

  // ijzeren regel 5: event mét de afwijkingen in de payload
  const evts = await db
    .select()
    .from(events)
    .where(eq(events.action, "near_match_auto_accepted"));
  expect(evts.length).toBe(1);
  const payload = evts[0].payload as { productId: string; deviations: unknown[] };
  expect(payload.productId).toBe(productId);
  expect(Array.isArray(payload.deviations)).toBe(true);
  expect(payload.deviations.length).toBeGreaterThan(0);
});

test("b3 hermatch: bestaande ocr-flag blijft staan (reviewer-bevinding 3) en blokkeert auto-door", async () => {
  const db = await createTestDb();
  const { line } = await seedAutoDoorLine(db, { source: "ocr", reviewKind: "ocr" });

  const outcome = await runMatcher(db as TestDb, line.id, "tester");
  expect(outcome.status).toBe("geel");

  const [saved] = await db.select().from(specLines).where(eq(specLines.id, line.id));
  // de hermatch wist de ocr-flag NIET…
  expect(saved.reviewKind).toBe("ocr");
  // …en de auto-door is geblokkeerd: geen match, geen chosen-kandidaat, geen event
  expect(saved.matchedProductId).toBeNull();
  const chosen = await db
    .select()
    .from(specLineCandidates)
    .where(
      and(
        eq(specLineCandidates.specLineId, line.id),
        eq(specLineCandidates.chosen, true),
      ),
    );
  expect(chosen.length).toBe(0);
  const evts = await db
    .select()
    .from(events)
    .where(eq(events.action, "near_match_auto_accepted"));
  expect(evts.length).toBe(0);
});

test("b3 hermatch: variant-flag blijft óók staan als de uitkomst niet geel is", async () => {
  const db = await createTestDb();
  // catalogus met exacte match (alles groen) — vroeger wiste dit pad élke reviewKind
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ",
    kelvin: 3000,
  });
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Variant blijft" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lp301",
      brandText: "XAL",
      productText: "SASSO 100",
      reqKelvin: 3000,
      reviewKind: "variant",
    })
    .returning();

  const outcome = await runMatcher(db as TestDb, line.id, "tester");
  expect(outcome.status).toBe("groen");
  const [saved] = await db.select().from(specLines).where(eq(specLines.id, line.id));
  expect(saved.reviewKind).toBe("variant"); // bewaard — niet door de hermatch gewist
  expect(saved.matchedProductId).toBeNull(); // groen wordt nooit automatisch gekozen
});

// A2 (reviewzwerm 2.5a), de persistente kant van het gat tussen Gat B en B3: een
// kandidaat die op ónze afgeleide optiekcode leunt zakt naar lijst 2, maar werd door
// pickUnambiguousYellow alsnog automatisch geaccepteerd — matched gezet, reviewKind
// null, en de regel telde geel mee in het projecttotaal zónder dat een mens hem zag.
test("A2: gele kandidaat op een onbevestigde bron wordt niet auto-geaccepteerd maar gereviewd", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 RD WF CRI90 ADJ DALI 24,7W cob LED 3000K",
    beamAngle: 57, // WF ≈ 57° uit onze eigen vertaaltabel
    kelvin: 3000,
  });
  const schema = await import("@/db/schema");
  await db
    .update(schema.products)
    .set({ tier2Source: { beamAngle: "optic-code" } })
    .where(eq(schema.products.id, productId));

  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Onbevestigd" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lp302",
      brandText: "XAL",
      productText: "SASSO 100",
      reqBeamAngle: "40", // 17° verschil → geel
      reqKelvin: 3000,
    })
    .returning();

  const outcome = await runMatcher(db as TestDb, line.id, "tester");
  expect(outcome.unambiguousYellow).toBeUndefined();

  const [saved] = await db.select().from(specLines).where(eq(specLines.id, line.id));
  // vóór de fix: matchedProductId gezet, reviewKind null, chosenBy "system:auto"
  expect(saved.matchedProductId).toBeNull();
  expect(saved.reviewKind).toBe("geel"); // de mens beslist
  const chosen = await db
    .select()
    .from(specLineCandidates)
    .where(
      and(
        eq(specLineCandidates.specLineId, line.id),
        eq(specLineCandidates.chosen, true),
      ),
    );
  expect(chosen.length).toBe(0);
  const evts = await db
    .select()
    .from(events)
    .where(eq(events.action, "near_match_auto_accepted"));
  expect(evts.length).toBe(0);
});
