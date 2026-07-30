// Eén bron voor de estimate (stap 9): deze tests bewijzen dat getEstimateData exact
// dezelfde cijfers oplevert als wat quote-view toonde (zelfde fixture-waarden als
// components/dossier/estimate.test.tsx): groen 12×310 = 3.720, geel 8×226 = 1.808,
// samen 5.528 — en dat blauw/rood/paars als p.m. meegaan zonder ooit opgeteld te worden.
import { expect, test } from "vitest";
import { projectDossiers, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { generateQuote } from "./dossiers";
import {
  computeEstimate,
  countedLineTotal,
  getEstimateData,
  notableDeviations,
  NUMBER_PENDING,
} from "./estimate";

// Zelfde stand als de scherm-fixture: twee zones, alle p.m.-statussen, één geel met
// afwijkingsnotitie, één paars mét prijs (mag nooit meetellen), één groen zonder aantal.
// De insert-volgorde is bewust gescrambeld: sortOrder bepaalt de aanvraagvolgorde.
async function seedEstimateDossier(db: TestDb) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();

  const p1 = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    articleCode: "L360-SASSO100",
  });
  const p2 = await seedBrandProduct(db, {
    brand: "Wever & Ducré",
    name: "SCAVA WALL SURF 1.0 3000K",
    price: "226.00",
    articleCode: "L092-SCAVA",
  });
  const p3 = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 60 2700K",
    price: "100.00",
    articleCode: "L360-SASSO60",
  });

  const rows = [
    // aanvraagvolgorde 0..5 — insert-volgorde wijkt bewust af
    { fixtureCode: "Lp302", zone: "B-02", status: "groen", quantity: null, matchedProductId: p3.productId, sortOrder: 5, brandText: "XAL", productText: "SASSO 60", manualPrice: null, deviations: null },
    { fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12, matchedProductId: p1.productId, sortOrder: 0, brandText: "XAL", productText: "SASSO 100", manualPrice: null, deviations: null },
    { fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2, matchedProductId: null, sortOrder: 4, brandText: null, productText: "Wandcontactdoos wit", manualPrice: "500.00", deviations: null },
    {
      fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8, matchedProductId: p2.productId, sortOrder: 1, brandText: "Wever & Ducré", productText: "SCAVA 1.0", manualPrice: null,
      deviations: [
        { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
      ],
    },
    { fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3, matchedProductId: null, sortOrder: 3, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)", manualPrice: null, deviations: null },
    { fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5, matchedProductId: null, sortOrder: 2, brandText: "Kreon", productText: "Prologe 80", manualPrice: null, deviations: null },
  ] as const;

  for (const r of rows) {
    await db.insert(specLines).values({
      dossierId: dossier.id,
      fixtureCode: r.fixtureCode,
      zone: r.zone,
      status: r.status,
      quantity: r.quantity,
      matchedProductId: r.matchedProductId,
      brandText: r.brandText,
      productText: r.productText,
      manualPrice: r.manualPrice,
      deviations: r.deviations ? [...r.deviations] : null,
      sortOrder: r.sortOrder,
    });
  }
  return dossier.id;
}

test("regels in aanvraagvolgorde; totalen exact wat het scherm toonde", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const data = await getEstimateData(db, dossierId);
  expect(data).not.toBeNull();
  const { lines, computed } = data!;

  // aanvraagvolgorde 0..5 — nooit hersorteren op status of prijs
  expect(lines.map((l) => l.fixtureCode)).toEqual([
    "Lp301", "Lw201", "Lb110", "Lr050", "Lx900", "Lp302",
  ]);

  // groen 12×310 = 3.720 ; geel 8×226 = 1.808 ; samen 5.528 (zelfde als quote-view)
  expect(computed.totals).toEqual({ groen: 3720, geel: 1808, samen: 5528 });

  // blauw/rood/paars: p.m. — getoond, nooit opgeteld (paars 2×500 zit NIET in samen)
  expect(computed.pm).toEqual({ blauw: 1, rood: 1, paars: 1, total: 3 });
  const paars = lines.find((l) => l.status === "paars")!;
  expect(paars.unitPrice).toBe("500.00"); // dagprijs zichtbaar…
  expect(countedLineTotal(paars)).toBeNull(); // …maar telt nooit mee

  // groen zonder aantal → p/st: telt niet mee in het totaal
  const zonderAantal = lines.find((l) => l.fixtureCode === "Lp302")!;
  expect(countedLineTotal(zonderAantal)).toBeNull();

  // afwijkingsnotitie (C-07) blijft aan de regel hangen
  const geel = lines.find((l) => l.status === "geel")!;
  expect(notableDeviations(geel).map((d) => d.note)).toEqual([
    "3000K i.p.v. 2700K",
  ]);

  // open punten: blauw merk inladen
  expect(computed.brandFreq).toEqual([["Kreon", 1]]);
});

test("zones: groepskoppen in eerste-verschijning-volgorde, met subtotalen", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const { computed } = (await getEstimateData(db, dossierId))!;
  expect(computed.hasZones).toBe(true);
  expect(computed.groups.map((g) => g.zone)).toEqual(["A-08", "B-02"]);

  // A-08: groen 3.720 + geel 1.808 = 5.528; B-02: alleen p.m./p-st → subtotaal 0
  expect(computed.groups[0].subtotal).toBe(5528);
  expect(computed.groups[1].subtotal).toBe(0);

  // nummering volgt de globale aanvraagvolgorde, niet de zone-groepering
  expect(
    computed.groups.flatMap((g) => g.lines.map((nl) => [nl.nr, nl.line.fixtureCode])),
  ).toEqual([
    [1, "Lp301"], [2, "Lw201"], [3, "Lb110"],
    [4, "Lr050"], [5, "Lx900"], [6, "Lp302"],
  ]);
});

// A-09 ongewijzigd: er wordt géén nummer gereserveerd bij aanmaken, de teller loopt
// pas bij uitsturen. Wat wél veranderde (UX-audit bug #6): de fallbacktekst was
// `BL-2026-{nummer volgt}` — Nederlands mét accolades op een Engelstalig klantstuk,
// en het jaar erin was een gok, want de teller loopt op het jaar van uitsturen.
test("kopblok: vóór genereren geen nummer maar 'Number assigned on sending', ná genereren het echte offertenummer", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const before = (await getEstimateData(db, dossierId))!;
  expect(before.header.quoteNumber).toBeNull();
  expect(before.computed.quoteNumberDisplay).toBe(NUMBER_PENDING);
  expect(before.computed.quoteNumberAssigned).toBe(false);
  // Geen sjabloonhaken en geen Nederlands meer op het klantstuk.
  expect(before.computed.quoteNumberDisplay).not.toMatch(/[{}]/);
  expect(before.computed.quoteNumberDisplay).not.toContain("nummer volgt");

  await generateQuote(db, dossierId, "hello@noplasticfloralfoam.com");

  const after = (await getEstimateData(db, dossierId))!;
  const year = new Date().getFullYear();
  expect(after.header.quoteNumber).toBe(`BL-${year}-0001`);
  expect(after.computed.quoteNumberDisplay).toBe(`BL-${year}-0001`);
  expect(after.computed.quoteNumberAssigned).toBe(true);
  expect(after.header.customer).toBe("Deerns");
  expect(after.header.author).toBe("hello@noplasticfloralfoam.com");
  expect(after.quote?.frozenAt ?? null).toBeNull();
});

test("computeEstimate is puur: zelfde invoer → zelfde uitkomst, lege lijst → nul", () => {
  const header = {
    quoteNumber: null,
    quoteDate: "2026-07-07",
    customer: null,
    projectRef: null,
    author: null,
    validUntil: null,
  };
  const empty = computeEstimate(header, []);
  expect(empty.totals).toEqual({ groen: 0, geel: 0, samen: 0 });
  expect(empty.pm.total).toBe(0);
  expect(empty.groups).toEqual([]);
  expect(empty.quoteNumberDisplay).toBe(NUMBER_PENDING);
});

// Kopblokpoort (UX-audit bug #6): met een lege datum of geldigheid is het stuk geen
// aanbod. computeEstimate is de enige bron daarvan — scherm, PDF-route en de
// downloadroute lezen alle drie dit veld.
test("kopblokpoort: datum én geldigheid nodig, en de ontbrekende velden staan er bij naam", () => {
  const basis = {
    quoteNumber: null,
    quoteDate: null,
    customer: "Deerns",
    projectRef: "PRJ-42",
    author: "timo@brink.nl",
    validUntil: null,
  };
  const leeg = computeEstimate(basis, []);
  expect(leeg.headerComplete).toBe(false);
  expect(leeg.missingHeaderFields).toEqual(["Date", "Valid until"]);

  // Eén van de twee is niet genoeg.
  expect(
    computeEstimate({ ...basis, quoteDate: "2026-07-07" }, []).missingHeaderFields,
  ).toEqual(["Valid until"]);
  expect(
    computeEstimate({ ...basis, validUntil: "2026-08-07" }, []).missingHeaderFields,
  ).toEqual(["Date"]);

  // generateQuote vult de datum wél en de geldigheid NIET (lib/repo/dossiers.ts) —
  // die tussenstand is precies de stand waarin de knoppen uit horen te staan.
  const compleet = computeEstimate(
    { ...basis, quoteDate: "2026-07-07", validUntil: "2026-08-07" },
    [],
  );
  expect(compleet.headerComplete).toBe(true);
  expect(compleet.missingHeaderFields).toEqual([]);

  // Een veld met alleen witruimte telt niet als ingevuld.
  expect(
    computeEstimate({ ...basis, quoteDate: "  ", validUntil: "2026-08-07" }, [])
      .headerComplete,
  ).toBe(false);
});
