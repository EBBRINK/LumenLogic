// Eén bron voor de estimate (stap 9): deze tests bewijzen dat getEstimateData exact
// dezelfde cijfers oplevert als wat quote-view toonde (zelfde fixture-waarden als
// components/dossier/estimate.test.tsx): groen 12×310 = 3.720, geel 8×226 = 1.808,
// samen 5.528 — en dat blauw/rood/paars als p.m. meegaan zonder ooit opgeteld te worden.
import { expect, test } from "vitest";
import { projectDossiers, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { DEFAULT_VALIDITY_DAYS, generateQuote, updateQuoteHeader } from "./dossiers";
import { setStatus } from "./project-status";
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

// Het nummer wordt toegekend bij GENEREREN (nextQuoteNumber) en daarna bewaard — niet
// bij uitsturen, wat A-09 wél zegt. De weergavetekst volgt sinds 2026-07-30 de code;
// die tegenspraak staat als besluit voor Timo in HANDOVER.md. Wat in bug #6 veranderde
// was de vorm: de oude fallback `BL-2026-{nummer volgt}` was Nederlands mét accolades
// op een Engelstalig klantstuk.
test("kopblok: vóór genereren geen nummer maar de wachttekst, ná genereren het echte offertenummer", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const before = (await getEstimateData(db, dossierId))!;
  expect(before.header.quoteNumber).toBeNull();
  expect(before.computed.quoteNumberDisplay).toBe(NUMBER_PENDING);
  expect(before.computed.quoteNumberAssigned).toBe(false);
  // Geen sjabloonhaken en geen Nederlands meer op het klantstuk.
  expect(before.computed.quoteNumberDisplay).not.toMatch(/[{}]/);
  expect(before.computed.quoteNumberDisplay).not.toContain("nummer volgt");
  // De tekst moet waar zijn: het nummer komt bij genereren, niet bij versturen. Zou
  // hij weer "on sending" beloven, dan liegt het klantstuk over zijn eigen software.
  expect(NUMBER_PENDING).toBe("Number assigned when the estimate is generated");
  expect(NUMBER_PENDING).not.toContain("on sending");

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

  // generateQuote vult sinds 2026-07-30 datum én geldigheid (zie de test verderop);
  // deze stand is dus wat een verse generatie oplevert.
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

// ── De poort zelf (herstel 2026-07-30) ───────────────────────────────────────
//
// De poort van bug #6 was een val: hij hing aan headerComplete, en géén codepad vulde
// ooit valid_until. Drie gewone klikken (Generate estimate → status "estimate
// gestuurd" → tab Estimate) haalden Print, Download PDF en → To XIS wég bij een
// offerte die al verstuurd wás, terwijl het kopblok op dat moment op slot zit. Twee
// besluiten repareren dat; deze tests pinnen ze allebei.

test("poort: een BEVROREN offerte is nooit gepoort, ook niet met een lege kop", () => {
  const leegBevroren = {
    quoteNumber: "BL-2026-0001",
    quoteDate: null,
    customer: "Deerns",
    projectRef: "PRJ-42",
    author: "timo@brink.nl",
    validUntil: null,
  };
  const bevroren = computeEstimate(leegBevroren, [], { frozen: true });
  // De kop is en blijft incompleet — dat feit versluieren we niet…
  expect(bevroren.headerComplete).toBe(false);
  expect(bevroren.missingHeaderFields).toEqual(["Date", "Valid until"]);
  // …maar de poort staat open: dit stuk IS het verstuurde document.
  expect(bevroren.frozen).toBe(true);
  expect(bevroren.outputsAllowed).toBe(true);

  // Exact dezelfde kop, níét bevroren → poort dicht. Zonder dit verschil is de
  // uitzondering betekenisloos.
  const open = computeEstimate(leegBevroren, [], { frozen: false });
  expect(open.outputsAllowed).toBe(false);
  // …en zonder opts is de default veilig: niet bevroren.
  expect(computeEstimate(leegBevroren, []).outputsAllowed).toBe(false);
});

test("poort: getEstimateData leest de bevriezing uit de quote-rij, niet uit een prop", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, dossierId, "timo@brink.nl");

  // De mens maakt de geldigheid leeg — dát is de enige manier waarop de poort nog
  // dichtgaat na een generatie.
  await updateQuoteHeader(db, dossierId, { validUntil: null }, "timo@brink.nl");
  const leeg = (await getEstimateData(db, dossierId))!;
  expect(leeg.frozen).toBe(false);
  expect(leeg.computed.outputsAllowed).toBe(false);

  // Status "estimate gestuurd" bevriest de offerte (I-06). Vanaf dat moment is het
  // stuk verstuurd en moet het altijd opnieuw te printen zijn — de drie-kliksval.
  await setStatus(db, dossierId, "estimate_gestuurd", "timo@brink.nl");
  const na = (await getEstimateData(db, dossierId))!;
  expect(na.quote?.frozenAt).not.toBeNull();
  expect(na.frozen).toBe(true);
  expect(na.computed.headerComplete).toBe(false); // de kop is nog steeds leeg…
  expect(na.computed.outputsAllowed).toBe(true); // …en toch mag het stuk naar buiten
});

test("generateQuote stelt een geldigheid voor, zodat een verse estimate niet meteen achter de poort valt", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, dossierId, "timo@brink.nl");

  const data = (await getEstimateData(db, dossierId))!;
  expect(data.header.quoteDate).not.toBeNull();
  // Voorstel = offertedatum + DEFAULT_VALIDITY_DAYS, in UTC gerekend.
  const verwacht = new Date(`${data.header.quoteDate}T00:00:00Z`);
  verwacht.setUTCDate(verwacht.getUTCDate() + DEFAULT_VALIDITY_DAYS);
  expect(data.header.validUntil).toBe(verwacht.toISOString().slice(0, 10));

  // En daarmee is de kop compleet: genereren → printen kan, zonder tussenstop.
  expect(data.computed.headerComplete).toBe(true);
  expect(data.computed.outputsAllowed).toBe(true);

  // Hergenereren respecteert een handmatige geldigheid (bewaren, niet overschrijven).
  await updateQuoteHeader(db, dossierId, { validUntil: "2027-01-31" }, "timo@brink.nl");
  await generateQuote(db, dossierId, "timo@brink.nl");
  expect((await getEstimateData(db, dossierId))!.header.validUntil).toBe("2027-01-31");
});

test("offertenummer met alleen witruimte telt niet als toegekend", () => {
  const basis = {
    quoteNumber: "   ",
    quoteDate: "2026-07-07",
    customer: null,
    projectRef: null,
    author: null,
    validUntil: "2026-08-07",
  };
  const c = computeEstimate(basis, []);
  // Zonder de trim leverde dit een lege PDF-titel op ("Estimate    — …").
  expect(c.quoteNumberAssigned).toBe(false);
  expect(c.quoteNumberDisplay).toBe(NUMBER_PENDING);
  // En een nummer mét spaties eromheen wordt netjes getrimd getoond.
  expect(
    computeEstimate({ ...basis, quoteNumber: " BL-2026-0007 " }, [])
      .quoteNumberDisplay,
  ).toBe("BL-2026-0007");
});
