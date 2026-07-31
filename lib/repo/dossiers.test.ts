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
import { generateQuote, getQuote, requireUnitPrice } from "./dossiers";

// De gevallen die de opnamefilter en de prijskeuze moeten kunnen scheiden:
//   Lp301 groen — gematcht, catalogus 310, GEEN dagprijs        → catalogusprijs
//   Lw201 geel  — gematcht, catalogus 226, dagprijs 199         → dagprijs wint (A8)
//   Lm500 groen — niet gematcht, alleen dagprijs 50             → dagprijs, geen herkomst
//   Lz000 groen — niet gematcht, géén prijs                     → valt buiten de offerte
//   Lx900 paars — dagprijs 500, maar telt nooit mee (E-02)      → valt buiten de offerte
//   Lv700 groen — gematcht, catalogus 120, dagprijs 399 VERLOPEN → catalogus + herkomst (A7)
//   Ld800 groen — niet gematcht, alleen een VERLOPEN dagprijs 77 → valt buiten de offerte (A7)
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

  // A7: dérde prijslijstdatum, zodat zichtbaar is dat de herkomst van de teruggevallen
  // regel écht van dit product komt en niet van p1 of p2.
  const p3 = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPLITBOX 3 TRIMLESS 2700K",
    price: "120.00",
    articleCode: "L210-SPLITBOX",
    validFrom: "2026-05-01",
  });

  const rows = [
    { fixtureCode: "Lp301", status: "groen", quantity: 12, matchedProductId: p1.productId, manualPrice: null, manualPriceValidUntil: null, sortOrder: 0 },
    { fixtureCode: "Lw201", status: "geel", quantity: 8, matchedProductId: p2.productId, manualPrice: "199.00", manualPriceValidUntil: null, sortOrder: 1 },
    { fixtureCode: "Lm500", status: "groen", quantity: 3, matchedProductId: null, manualPrice: "50.00", manualPriceValidUntil: null, sortOrder: 2 },
    { fixtureCode: "Lz000", status: "groen", quantity: 7, matchedProductId: null, manualPrice: null, manualPriceValidUntil: null, sortOrder: 3 },
    { fixtureCode: "Lx900", status: "paars", quantity: 2, matchedProductId: null, manualPrice: "500.00", manualPriceValidUntil: null, sortOrder: 4 },
    { fixtureCode: "Lv700", status: "groen", quantity: 5, matchedProductId: p3.productId, manualPrice: "399.00", manualPriceValidUntil: "2020-06-30", sortOrder: 5 },
    { fixtureCode: "Ld800", status: "groen", quantity: 4, matchedProductId: null, manualPrice: "77.00", manualPriceValidUntil: "2020-06-30", sortOrder: 6 },
  ] as const;

  for (const r of rows) {
    await db.insert(specLines).values({
      dossierId: dossier.id,
      fixtureCode: r.fixtureCode,
      status: r.status,
      quantity: r.quantity,
      matchedProductId: r.matchedProductId,
      manualPrice: r.manualPrice,
      manualPriceValidUntil: r.manualPriceValidUntil,
      sortOrder: r.sortOrder,
    });
  }
  return { dossierId: dossier.id, p1, p2, p3 };
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

  // Het offertetotaal — het cijfer onderaan het klantstuk. 3.720 + 1.592 + 150 + 600
  // (Lv700 op catalogus, A7) = 6.062; met de catalogusprijs op Lw201 zou hier 6.278
  // staan, en met de VERLOPEN dagprijs op Lv700 7.457.
  const data = (await getQuote(db, dossierId))!;
  expect(data.total).toBe(6062);
  expect(data.total).not.toBe(6278);
  expect(data.total).not.toBe(7457);
});

// ── A7: de verlopen dagprijs op het echte klantdocument ──────────────────────
//
// quote_lines is niet een berekening op het scherm maar de weggeschreven (en straks
// bevroren) offerte. Een dagprijs van 399 die in juni 2020 verliep hoort daar niet in.
test("generateQuote: verlopen dagprijs → catalogusprijs, en de prijslijst-herkomst is nu WÉL gevuld (A7)", async () => {
  const db = await createTestDb();
  const { dossierId, p3 } = await seedQuoteDossier(db);

  const quote = await generateQuote(db, dossierId, "timo@brink.nl");
  const byCode = await linesOf(db, quote.id);

  // Het bedrag op de offerteregel is de catalogusprijs.
  expect(byCode["Lv700"].unitPrice).toBe("120.00");
  expect(byCode["Lv700"].unitPrice).not.toBe("399.00");
  expect(byCode["Lv700"].lineTotal).toBe("600.00"); // 5 × 120, niet 5 × 399 = 1.995

  // En omdat de prijs nu ÚIT de catalogus komt, hangt de herkomst er ook aan — precies
  // andersom dan bij Lw201, waar de (geldige) dagprijs wint en de herkomst leeg blijft.
  // De herkomst volgt de gekozen prijs, niet het gematchte product: dat is dezelfde
  // regel die A8 pinde, nu vanaf de andere kant.
  expect(byCode["Lv700"].priceListId).toBe(p3.priceListId);
  expect(byCode["Lv700"].sourceListDate).toBe("2026-05-01");
});

// De consequentie van de vervalregel voor de opnamefilter, expliciet gepind: een regel
// waarvan de ÉNIGE prijs een verlopen dagprijs was heeft geen actueel bedrag meer, en
// valt daarmee uit de gegenereerde offerte — net als een regel zonder énige prijs
// (Lz000) er altijd al uitviel. Bewust: een "€ 0,00"-regel op een klantdocument is erger
// dan geen regel. De estimate (scherm + PDF) toont die regel wél, met "—" en het
// merkteken dat zegt dat de dagprijs verliep — daar wordt dus niets weggemoffeld.
test("generateQuote: een regel met alléén een verlopen dagprijs valt uit de offerte (A7)", async () => {
  const db = await createTestDb();
  const { dossierId } = await seedQuoteDossier(db);

  const quote = await generateQuote(db, dossierId, "timo@brink.nl");
  const byCode = await linesOf(db, quote.id);

  expect(byCode["Ld800"]).toBeUndefined(); // 4 × 77 komt nergens terecht
  expect(Object.values(byCode).map((l) => l.lineTotal)).not.toContain("308.00");
  // …terwijl de regel mét catalogusprijs eronder er juist wél in zit.
  expect(byCode["Lv700"]).toBeDefined();
});

// ── R1: ÉÉN KLOK PER OPERATIE ────────────────────────────────────────────────
//
// generateQuote stelt de vervalvraag TWEE keer per regel: in de opnamefilter ("heeft
// deze regel een prijs?") en bij het bouwen van de offerteregel ("wélke prijs?"). Lazen
// die twee elk hun eigen `todayIso()`, dan konden ze over de UTC-middernachtgrens uit
// elkaar lopen: de filter laat een regel door waarvan de dagprijs vandaag nog geldig is,
// en een tel later — inmiddels "morgen" — geeft de tweede aanroep `unitPrice: null`.
// `Number(null)` is 0, dus `toFixed(2)` schreef "0.00" als stukprijs én regeltotaal het
// klantdocument in: precies de € 0,00-regel die het commentaar boven de filter verbiedt.
//
// Deterministisch te bewijzen zónder op middernacht te wachten, door de klok te
// injecteren. Ld800 heeft als ÉNIGE prijs een dagprijs die op 2020-06-30 verloopt; de
// echte kalender staat jaren daarna. Injecteren we exact 2020-06-30 (valid_until is
// inclusief), dan is die dagprijs geldig en hoort de regel er compleet op te staan.
//
// Dit is meteen de rood/groen-proef: pakt één van de twee aanroepen zijn eigen klok in
// plaats van de doorgegeven dag, dan is de dagprijs dáár wél verlopen en valt de test om.
// Bij de filter verdwijnt de regel; bij de bouwer levert het `unitPrice: null` op — vóór
// deze reparatie "0.00", nu een luide throw van requireUnitPrice.
test("R1: generateQuote leest de klok één keer — filter en offerteregel zien dezelfde dag", async () => {
  const db = await createTestDb();
  const { dossierId } = await seedQuoteDossier(db);

  // De laatste dag waarop de dagprijzen van Ld800 en Lv700 nog geldig zijn.
  const quote = await generateQuote(db, dossierId, "timo@brink.nl", "2020-06-30");
  const byCode = await linesOf(db, quote.id);

  // De regel staat erop, met zijn dagprijs — niet als gat en niet als nul.
  expect(byCode["Ld800"]).toBeDefined();
  expect(byCode["Ld800"].unitPrice).toBe("77.00");
  expect(byCode["Ld800"].lineTotal).toBe("308.00"); // 4 × 77

  // DE ASSERTIE WAAR HET OM GAAT: nergens op deze offerte staat een bedrag van nul.
  expect(Object.values(byCode).map((l) => l.unitPrice)).not.toContain("0.00");
  expect(Object.values(byCode).map((l) => l.lineTotal)).not.toContain("0.00");

  // En de tweede aanroep gebruikt aantoonbaar dezelfde geïnjecteerde dag: op 30 juni
  // 2020 wint de dagprijs van Lv700 (399) van zijn catalogusprijs (120), inclusief de
  // bijbehorende herkomst-regel (dagprijs → géén prijslijst-verwijzing).
  expect(byCode["Lv700"].unitPrice).toBe("399.00");
  expect(byCode["Lv700"].priceListId).toBeNull();
});

// Precies één dag later kantelt dezelfde regel — en dan valt hij eruit, niet als
// € 0,00-regel erin. Samen met de test hierboven pint dit dat de grens aan beide kanten
// door dezelfde kloklezing wordt getrokken.
test("R1: één dag later valt dezelfde regel uit de offerte — nooit als € 0,00-regel", async () => {
  const db = await createTestDb();
  const { dossierId } = await seedQuoteDossier(db);

  const quote = await generateQuote(db, dossierId, "timo@brink.nl", "2020-07-01");
  const byCode = await linesOf(db, quote.id);

  expect(byCode["Ld800"]).toBeUndefined();
  expect(Object.values(byCode).map((l) => l.unitPrice)).not.toContain("0.00");
  expect(Object.values(byCode).map((l) => l.lineTotal)).not.toContain("0.00");
  // Lv700 heeft wél een catalogusprijs om op terug te vallen en blijft dus staan.
  expect(byCode["Lv700"].unitPrice).toBe("120.00");
});

// De vangrail zelf. Langs generateQuote is dit pad na de reparatie ONBEREIKBAAR — filter
// en bouwer lezen dezelfde klok, dus ze kunnen niet meer van mening verschillen. Juist
// daarom staat de controle in een eigen functie: zo is te bewijzen dat hij luidruchtig
// stukgaat in plaats van "0.00" weg te schrijven, zonder de fixture te verwringen.
test("R1-vangrail: geen stukprijs bij de offerteregel-bouwer → throw, nooit stilzwijgend 0", () => {
  expect(() => requireUnitPrice(null, "Ld800")).toThrow(/Ld800/);
  expect(() => requireUnitPrice(null, "Ld800")).toThrow(/opnamefilter/);
  // Wat hij vervangt: `Number(null)` is 0 en `(0).toFixed(2)` is "0.00".
  expect(Number(null).toFixed(2)).toBe("0.00");
  // En bij een echte prijs gedraagt hij zich als de `Number()` die er stond.
  expect(requireUnitPrice("77.00", "Ld800")).toBe(77);
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

  // Lz000 (groen zonder énige prijs), Lx900 (paars, telt nooit mee) en Ld800 (groen,
  // alléén een VERLOPEN dagprijs — A7) blijven eruit; de opnamefilter leest dezelfde
  // prijskeuze als de regel hierboven.
  expect(Object.keys(byCode).sort()).toEqual([
    "Lm500", "Lp301", "Lv700", "Lw201",
  ]);
  expect(byCode["Lz000"]).toBeUndefined();
  expect(byCode["Lx900"]).toBeUndefined();
  expect(byCode["Ld800"]).toBeUndefined();
});
