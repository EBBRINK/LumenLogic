// De prijsloze estimate-PDF (sprint 3.2b) — getoetst op de TERUGGELEZEN TEKST van het
// gerenderde bestand, niet op een prop of een conditie in de code. Dat onderscheid is
// de hele opdracht: "de externe variant bevat geen prijzen" is pas bewezen als je in de
// bytes die de deur uit gaan geen bedrag meer kunt vinden.
//
// Dezelfde geseede dossier-stand als lib/pdf/estimate.test.ts, en dat is opzet: die
// stand draagt bedragen op élke manier waarop dit systeem ze kent — catalogusprijs,
// dagprijs, verlopen dagprijs mét terugval, verlopen dagprijs zónder terugval, en een
// paarse regel met een prijs die nooit had mogen meetellen. Loopt daar één bedrag
// doorheen, dan vindt deze test het.
import { expect, test } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { projectDossiers, specLineCandidates, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { generateQuote } from "@/lib/repo/dossiers";
import { getEstimateData } from "@/lib/repo/estimate";
import { toPricelessEstimate } from "@/lib/repo/estimate-extern";
import { renderEstimatePdf } from "./estimate";
import { renderExternalEstimatePdf } from "./estimate-extern";
import { ALLE_DOSSIERS } from "@/lib/repo/toegang";

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
  const p4 = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPLITBOX 3 TRIMLESS 2700K",
    price: "120.00",
    articleCode: "L210-SPLITBOX",
  });

  const rows = [
    { fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12, matchedProductId: p1.productId, sortOrder: 0, brandText: "XAL", productText: "SASSO 100", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    {
      fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8, matchedProductId: p2.productId, sortOrder: 1, brandText: "Wever & Ducré", productText: "SCAVA 1.0", manualPrice: "199.00", manualPriceValidUntil: null,
      deviations: [
        { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
      ],
    },
    { fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5, matchedProductId: null, sortOrder: 2, brandText: "Kreon", productText: "Prologe 80", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    // Verlopen dagprijs mét catalogus-terugval.
    { fixtureCode: "Lv700", zone: "A-08", status: "groen", quantity: 3, matchedProductId: p4.productId, sortOrder: 6, brandText: "Delta Light", productText: "SPLITBOX 3", manualPrice: "399.00", manualPriceValidUntil: "2020-06-30", deviations: null },
    { fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3, matchedProductId: null, sortOrder: 3, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2, matchedProductId: null, sortOrder: 4, brandText: null, productText: "Wandcontactdoos wit", manualPrice: "500.00", manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lo400", zone: "B-02", status: "open", quantity: 4, matchedProductId: null, sortOrder: 5, brandText: "Modular", productText: "Smart Tubed 82", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    // Verlopen dagprijs zónder terugval.
    { fixtureCode: "Ld800", zone: "B-02", status: "groen", quantity: 4, matchedProductId: null, sortOrder: 7, brandText: "Delta Light", productText: "SPLITBOX 1", manualPrice: "455.00", manualPriceValidUntil: "2020-06-30", deviations: null },
  ] as const;

  for (const r of rows) {
    const [line] = await db
      .insert(specLines)
      .values({
        dossierId: dossier.id,
        fixtureCode: r.fixtureCode,
        zone: r.zone,
        status: r.status,
        quantity: r.quantity,
        matchedProductId: r.matchedProductId,
        brandText: r.brandText,
        productText: r.productText,
        manualPrice: r.manualPrice,
        manualPriceValidUntil: r.manualPriceValidUntil,
        deviations: r.deviations ? [...r.deviations] : null,
        sortOrder: r.sortOrder,
      })
      .returning();
    if (r.fixtureCode === "Lw201" && r.matchedProductId) {
      await db.insert(specLineCandidates).values({
        specLineId: line.id,
        productId: r.matchedProductId,
        rank: 1,
        list: "aantoonbaar",
        chosen: true,
        chosenBy: "system:auto",
      });
    }
  }
  return dossier.id;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/**
 * Elke vorm waarin dit systeem een bedrag op papier zet, als patroon.
 *
 * Bewust NIET "komt het cijfer 310 voor": aantallen (12, 8), zones (A-08), artikelcodes
 * (L360-SASSO100) en productnamen (SASSO 100) dragen ook cijfers, en een test die
 * daarop struikelt wordt binnen een week uitgezet. Wat een bedrag onderscheidt is de
 * VORM: het euroteken, of een getal met precies twee decimalen.
 */
const BEDRAG_PATRONEN: { naam: string; patroon: RegExp }[] = [
  { naam: "euroteken", patroon: /€/ },
  // nl-NL zoals formatEur schrijft: "1.234,50" / "310,00".
  { naam: "bedrag met decimaalkomma", patroon: /\d[\d.]*,\d{2}(?!\d)/ },
  // De ruwe vorm zoals hij in de database staat, mocht een pad formatEur overslaan.
  { naam: "bedrag met decimaalpunt", patroon: /\d+\.\d{2}(?!\d)/ },
];

function bedragenIn(tekst: string): string[] {
  return BEDRAG_PATRONEN.filter(({ patroon }) => patroon.test(tekst)).map(
    ({ naam, patroon }) => `${naam}: ${tekst.match(patroon)?.[0]}`,
  );
}

// ── Het vangnet onder de test ────────────────────────────────────────────────

test("de INTERNE PDF valt wél door de bedragen-zeef (anders bewijst de test hieronder niets)", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, ALLE_DOSSIERS, dossierId, "hello@noplasticfloralfoam.com");
  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossierId))!;

  const tekst = await pdfText(await renderEstimatePdf(data));
  // Zonder deze omgekeerde toets zou een kapotte zeef (of een lege PDF-tekst) de
  // externe assertie gratis groen maken. Het interne stuk hóórt bedragen te dragen.
  expect(bedragenIn(tekst).length).toBeGreaterThan(0);
});

// ── De eis ────────────────────────────────────────────────────────────────────

test("de EXTERNE PDF bevat geen enkel bedrag, en wél de regels, aantallen en statussen", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, ALLE_DOSSIERS, dossierId, "hello@noplasticfloralfoam.com");
  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossierId))!;

  const tekst = await pdfText(
    await renderExternalEstimatePdf(toPricelessEstimate(data)),
  );

  expect(
    bedragenIn(tekst),
    "er staat een bedrag op het externe stuk — dat is een prijslek naar de partij " +
      "die de prijzen juist niet mag zien (ijzeren regel 1 en 4)",
  ).toEqual([]);

  // En de kolomkoppen van het geld staan er niet, ook niet leeg.
  expect(tekst).not.toContain("Unit price");
  expect(tekst).not.toContain("Line total");
  expect(tekst).not.toContain("Combined");
  expect(tekst).not.toContain("Subtotal");
  // "Gross prices excl. VAT…" is de interne voettekst.
  expect(tekst).not.toContain("Gross prices");

  // Wat er wél hoort te staan — anders is "nul bedragen" ook waar voor een leeg vel.
  expect(tekst).toContain("Ziekenhuis Noord");
  expect(tekst).toContain("Lp301");
  expect(tekst).toContain("SASSO 100 SQ SP CEIL 2700K");
  expect(tekst).toContain("Quantity");
  expect(tekst).toContain("Status");
  expect(tekst).toContain("ZONE A-08");
  expect(tekst).toContain("ZONE B-02");
  // Statuswoorden (de kleuren zijn inkt, die zie je niet terug in de tekstlaag).
  expect(tekst).toContain("Green");
  expect(tekst).toContain("Yellow");
  expect(tekst).toContain("Open");
  // Afwijkingsnotitie: spec-transparantie blijft, ook zonder prijzen (C-07).
  expect(tekst).toContain("3000K");
  // Open punten, met de prijsloze zinnen.
  expect(tekst).toContain("Open items & actions");
  expect(tekst).toContain("brand still to be loaded");
  expect(tekst).toContain("Kreon");
  // De eigen voettekst.
  expect(tekst).toContain("Pricing is not included");
});

test("het externe stuk noemt de prijsbron nergens — ook niet het vervalmerkteken", async () => {
  // Twee regels in de fixture dragen een VERLOPEN dagprijs. Op het interne stuk levert
  // dat de subregel "day price expired 30 Jun 2020 — catalogue price used instead" op.
  // Die zin bevat geen bedrag, maar vertelt wél welke prijsbron gebruikt is — en zonder
  // bedrag ernaast is hij voor de ontvanger bovendien betekenisloos.
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, ALLE_DOSSIERS, dossierId, "hello@noplasticfloralfoam.com");
  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossierId))!;

  const intern = await pdfText(await renderEstimatePdf(data));
  expect(intern, "de fixture hoort een verlopen dagprijs te dragen").toContain(
    "day price expired",
  );

  const extern = await pdfText(
    await renderExternalEstimatePdf(toPricelessEstimate(data)),
  );
  expect(extern).not.toContain("day price expired");
  expect(extern).not.toContain("catalogue price");
  expect(extern).not.toContain("p.m.");
});

test("een dossier zonder regels levert een leeg, maar geldig prijsloos stuk", async () => {
  const db = await createTestDb();
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Leeg project", customer: "Deerns" })
    .returning();

  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossier.id))!;
  const tekst = await pdfText(
    await renderExternalEstimatePdf(toPricelessEstimate(data)),
  );

  expect(bedragenIn(tekst)).toEqual([]);
  expect(tekst).toContain("No spec lines in this project yet.");
  expect(tekst).toContain("Leeg project");
});
