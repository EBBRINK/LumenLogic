// generateQuote: de derde plek waar de dagprijsregel (I-04) toesloeg — en de enige die
// écht een klantdocument wegschrijft (quote_lines is de bevroren offerte, niet een
// berekening op het scherm). Tot A8 stond hier een eigen kopie van
// `manualPrice ?? matchedPrice` én een eigen kopie van de herkomstregel
// (`l.manualPrice != null`), en er was geen enkele test op dit bestand. Deze tests
// pinnen beide via lib/repo/day-price.ts:
//   • de DAGPRIJS wint op unit_price, op line_total én in het offertetotaal;
//   • een dagprijsregel krijgt géén prijslijst-herkomst, een catalogusregel wél;
//   • "heeft deze regel een prijs?" (de opnamefilter) leest dezelfde functie.
import { expect, test } from "vitest";
import { asc, eq } from "drizzle-orm";
import { projectDossiers, quoteLines, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { generateQuote, getQuote } from "./dossiers";

// Vier soorten regels, precies de vier gevallen die de filter en de prijskeuze moeten
// kunnen scheiden:
//   Lp301 groen — gematcht, catalogus 310, GEEN dagprijs        → catalogusprijs
//   Lw201 geel  — gematcht, catalogus 226, dagprijs 199         → dagprijs wint (A8)
//   Lm500 groen — niet gematcht, alleen dagprijs 50             → dagprijs, geen herkomst
//   Lz000 groen — niet gematcht, géén prijs                     → valt buiten de offerte
//   Lx900 paars — dagprijs 500, maar telt nooit mee (E-02)      → valt buiten de offerte
async function seedQuoteDossier(db: TestDb) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();

  const p1 = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    articleCode: "L360-SASSO100",
    validFrom: "2026-01-01",
  });
  // Andere prijslijstdatum dan p1, zodat een verwisselde herkomst opvalt.
  const p2 = await seedBrandProduct(db, {
    brand: "Wever & Ducré",
    name: "SCAVA WALL SURF 1.0 3000K",
    price: "226.00",
    articleCode: "L092-SCAVA",
    validFrom: "2026-03-01",
  });

  const rows = [
    { fixtureCode: "Lp301", status: "groen", quantity: 12, matchedProductId: p1.productId, manualPrice: null, sortOrder: 0 },
    { fixtureCode: "Lw201", status: "geel", quantity: 8, matchedProductId: p2.productId, manualPrice: "199.00", sortOrder: 1 },
    { fixtureCode: "Lm500", status: "groen", quantity: 3, matchedProductId: null, manualPrice: "50.00", sortOrder: 2 },
    { fixtureCode: "Lz000", status: "groen", quantity: 7, matchedProductId: null, manualPrice: null, sortOrder: 3 },
    { fixtureCode: "Lx900", status: "paars", quantity: 2, matchedProductId: null, manualPrice: "500.00", sortOrder: 4 },
  ] as const;

  for (const r of rows) {
    await db.insert(specLines).values({
      dossierId: dossier.id,
      fixtureCode: r.fixtureCode,
      status: r.status,
      quantity: r.quantity,
      matchedProductId: r.matchedProductId,
      manualPrice: r.manualPrice,
      sortOrder: r.sortOrder,
    });
  }
  return { dossierId: dossier.id, p1, p2 };
}

async function linesOf(db: TestDb, quoteId: string) {
  const rows = await db
    .select()
    .from(quoteLines)
    .where(eq(quoteLines.quoteId, quoteId))
    .orderBy(asc(quoteLines.fixtureCode));
  return Object.fromEntries(rows.map((r) => [r.fixtureCode, r]));
}

test("generateQuote: dagprijs wint van catalogusprijs op de offerteregel én in het totaal (I-04)", async () => {
  const db = await createTestDb();
  const { dossierId } = await seedQuoteDossier(db);

  const quote = await generateQuote(db, dossierId, "timo@brink.nl");
  const byCode = await linesOf(db, quote.id);

  // De gematchte GELE regel: catalogus 226 staat er wél, maar de dagprijs 199 is wat de
  // klant betaalt. Dit is het geval dat vóór A8 door geen enkele test werd afgedekt.
  expect(byCode["Lw201"].unitPrice).toBe("199.00");
  expect(byCode["Lw201"].unitPrice).not.toBe("226.00");
  expect(byCode["Lw201"].lineTotal).toBe("1592.00"); // 8 × 199, niet 8 × 226 = 1.808
  expect(byCode["Lw201"].productId).not.toBeNull(); // hij ís gematcht…

  // …en de catalogusregel ernaast blijft gewoon de catalogusprijs dragen.
  expect(byCode["Lp301"].unitPrice).toBe("310.00");
  expect(byCode["Lp301"].lineTotal).toBe("3720.00");

  // Dagprijs zonder match: gewoon de dagprijs.
  expect(byCode["Lm500"].unitPrice).toBe("50.00");
  expect(byCode["Lm500"].lineTotal).toBe("150.00");

  // Het offertetotaal — het cijfer onderaan het klantstuk. 3.720 + 1.592 + 150 = 5.462;
  // met de catalogusprijs zou hier 5.678 staan.
  const data = (await getQuote(db, dossierId))!;
  expect(data.total).toBe(5462);
  expect(data.total).not.toBe(5678);
});

test("generateQuote: prijsherkomst volgt de gekozen prijs, niet het gematchte product", async () => {
  const db = await createTestDb();
  const { dossierId, p1 } = await seedQuoteDossier(db);

  const quote = await generateQuote(db, dossierId, "timo@brink.nl");
  const byCode = await linesOf(db, quote.id);

  // Catalogusprijs → wél herkomst: uit wélke prijslijst, met wélke ingangsdatum.
  expect(byCode["Lp301"].priceListId).toBe(p1.priceListId);
  expect(byCode["Lp301"].sourceListDate).toBe("2026-01-01");

  // Dagprijs op een GEMATCHTE regel → géén herkomst, ook al heeft het product een
  // actieve prijslijst (2026-03-01). De offerte mag niet suggereren dat deze prijs uit
  // die lijst komt: hij komt van de calculator.
  expect(byCode["Lw201"].priceListId).toBeNull();
  expect(byCode["Lw201"].sourceListDate).toBeNull();

  // Dagprijs zonder match: er ís niets om naar te verwijzen.
  expect(byCode["Lm500"].priceListId).toBeNull();
  expect(byCode["Lm500"].sourceListDate).toBeNull();
});

test("generateQuote: alleen groen/geel mét prijs komen op de offerte", async () => {
  const db = await createTestDb();
  const { dossierId } = await seedQuoteDossier(db);

  const quote = await generateQuote(db, dossierId, "timo@brink.nl");
  const byCode = await linesOf(db, quote.id);

  // Lz000 (groen zonder énige prijs) en Lx900 (paars, telt nooit mee) blijven eruit —
  // de opnamefilter leest dezelfde prijskeuze als de regel hierboven.
  expect(Object.keys(byCode).sort()).toEqual(["Lm500", "Lp301", "Lw201"]);
  expect(byCode["Lz000"]).toBeUndefined();
  expect(byCode["Lx900"]).toBeUndefined();
});
