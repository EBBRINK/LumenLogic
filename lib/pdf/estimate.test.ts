// Estimate-PDF (B5, stap 9): gegenereerd uit een geseede dossier-stand (PGlite, zelfde
// migraties als Neon) en teruggelezen met unpdf — we testen op terugleesbare
// TEKSTINHOUD, niet op pixels: offertenummer, regels, totalen per kleur, p.m.-post en
// afwijkingsnotitie. Plus: extreem lange naam → ellipsis (geen crash) en meerpaginasteun.
import { expect, test } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { projectDossiers, specLineCandidates, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { generateQuote } from "@/lib/repo/dossiers";
import { countedLineTotal, getEstimateData } from "@/lib/repo/estimate";
import { renderEstimatePdf } from "./estimate";
import { ALLE_DOSSIERS } from "@/lib/repo/toegang";

// Zelfde stand als lib/repo/estimate.test.ts: groen 12×310, geel 8×199 mét
// afwijkingsnotitie, blauw/rood/paars/open als p.m., twee zones. De open regel hoort
// erbij omdat dát de normale stand van een verse import is: hij kreeg "p.m." in de
// regeltotaalkolom en stond nergens verantwoord (A4).
//
// A8: de gele regel is gematcht (catalogus 226) én draagt een dagprijs (199). Dít is
// het papier waar het om gaat — de prijs die de klant leest moet de dagprijs zijn en
// de catalogusprijs mag er nergens op staan.
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
  // A7: het product waarop de VERLOPEN dagprijs terugvalt (catalogus 120).
  const p4 = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPLITBOX 3 TRIMLESS 2700K",
    price: "120.00",
    articleCode: "L210-SPLITBOX",
  });

  const rows = [
    { fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12, matchedProductId: p1.productId, sortOrder: 0, brandText: "XAL", productText: "SASSO 100", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    {
      // A8: gematcht (catalogus 226) MÉT dagprijs 199 — I-04 moet hier kiezen.
      fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8, matchedProductId: p2.productId, sortOrder: 1, brandText: "Wever & Ducré", productText: "SCAVA 1.0", manualPrice: "199.00", manualPriceValidUntil: null,
      deviations: [
        { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
      ],
    },
    { fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5, matchedProductId: null, sortOrder: 2, brandText: "Kreon", productText: "Prologe 80", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    // A7: gematcht (catalogus 120) mét een dagprijs (399) die op 30 juni 2020 verliep.
    // Bewust ZONDER afwijkingsnotitie: de subregel draagt dan alleen het vervalmerkteken
    // en de ellipsis-afbreking kan hem niet halverwege afkappen.
    { fixtureCode: "Lv700", zone: "A-08", status: "groen", quantity: 3, matchedProductId: p4.productId, sortOrder: 6, brandText: "Delta Light", productText: "SPLITBOX 3", manualPrice: "399.00", manualPriceValidUntil: "2020-06-30", deviations: null },
    { fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3, matchedProductId: null, sortOrder: 3, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2, matchedProductId: null, sortOrder: 4, brandText: null, productText: "Wandcontactdoos wit", manualPrice: "500.00", manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lo400", zone: "B-02", status: "open", quantity: 4, matchedProductId: null, sortOrder: 5, brandText: "Modular", productText: "Smart Tubed 82", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    // A7, HET EERLIJKE GAT (reparatie R2): een dagprijs (455) die op 30 juni 2020
    // verliep, op een regel ZONDER match — er is dus geen catalogusprijs om op terug te
    // vallen. Dit is precies de regel die uít quote_lines valt (generateQuote neemt alleen
    // regels met een actueel bedrag mee), waardoor de estimate-PDF zijn énige
    // zichtbaarheid is. Die zin werd tot nu toe alleen op een handgebouwde EstimateLine
    // in components/dossier/estimate.test.tsx getoetst; hier loopt hij door het echte pad
    // getSpecLines → unitPriceOf → getEstimateData → renderEstimatePdf.
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
    // B3: de gele regel is een automatisch geaccepteerde bijna-match
    // (chosen-kandidaat met chosenBy='system:auto') → label op de PDF.
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

test("PDF bevat offertenummer, regel, totalen per kleur, p.m.-post en afwijkingsnotitie", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, ALLE_DOSSIERS, dossierId, "tester@voorbeeld.nl");

  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossierId))!;
  const bytes = await renderEstimatePdf(data);
  const text = await pdfText(bytes);

  // kopblok
  const year = new Date().getFullYear();
  expect(text).toContain(`BL-${year}-0001`); // offertenummer
  expect(text).toContain("Ziekenhuis Noord");
  expect(text).toContain("Deerns");
  expect(text).toContain("Brink Licht"); // tekstkop (geen logo-asset in public/)

  // een regel mét gematcht product
  expect(text).toContain("Lp301");
  expect(text).toContain("SASSO 100 SQ SP CEIL 2700K");

  // totalen per kleur + eindtotaal (bruto adviesprijs, nl-NL formaat)
  expect(text).toContain("4.080,00"); // groen 12×310 + 3×120 (Lv700 op catalogus, A7)
  expect(text).toContain("1.592,00"); // geel 8×199 (dagprijs, I-04)
  expect(text).toContain("5.672,00"); // samen
  expect(text).toContain("Combined (green + yellow)");

  // ── A7 op papier: de VERLOPEN dagprijs ──────────────────────────────────────
  // Lv700 had een dagprijs van 399 die op 30 juni 2020 verliep. Op het klantstuk staat
  // de catalogusprijs (120), mét een zin die zegt dat de dagprijs verlopen is en wat er
  // in plaats daarvan gebruikt wordt.
  expect(text).toContain("120,00"); // stukprijs = catalogus
  expect(text).toContain("360,00"); // regeltotaal 3 × 120
  expect(text).toContain(
    "day price expired 30 Jun 2020 — catalogue price used instead",
  );
  // DE NEGATIEVE ASSERTIE — dit is degene die een regressie betrapt. Het verouderde
  // bedrag mag NERGENS op het papier staan: niet als stukprijs (399,00), niet als
  // regeltotaal (3 × 399 = 1.197,00), en niet verstopt in het groentotaal (4.917,00) of
  // het eindtotaal (6.509,00).
  expect(text).not.toContain("399,00");
  expect(text).not.toContain("1.197,00");
  expect(text).not.toContain("4.917,00");
  expect(text).not.toContain("6.509,00");

  // ── A7, het eerlijke gat (R2): verlopen dagprijs ZONDER catalogusprijs ───────
  // Ld800 had een dagprijs van 455 die op 30 juni 2020 verliep en géén match om op terug
  // te vallen. Deze regel valt uit quote_lines — het klantdocument dat generateQuote
  // wegschrijft — dus dit papier is zijn enige zichtbaarheid. Er staat geen bedrag, en
  // de tweede klantzin legt uit waarom.
  expect(text).toContain("Ld800");
  expect(text).toContain(
    "day price expired 30 Jun 2020 — no catalogue price to fall back on",
  );

  // Geen bedrag op die regel, rechtstreeks uit dezelfde data die de PDF tekent: de
  // stukprijs is leeg (PDF drukt "—") en er is geen regeltotaal (idem "—").
  const ld800 = data.computed.groups
    .flatMap((g) => g.lines)
    .find((nl) => nl.line.fixtureCode === "Ld800")!.line;
  expect(ld800.dayPriceExpiredOn).toBe("2020-06-30");
  expect(ld800.unitPrice).toBeNull();
  expect(countedLineTotal(ld800)).toBeNull();

  // En het verlopen bedrag staat NERGENS op het papier: niet als stukprijs (455,00),
  // niet als regeltotaal (4 × 455 = 1.820,00), en het is ook niet in de totalen gesijpeld
  // (groen zou 5.900,00 worden, samen 7.492,00).
  expect(text).not.toContain("455,00");
  expect(text).not.toContain("1.820,00");
  expect(text).not.toContain("5.900,00");
  expect(text).not.toContain("7.492,00");

  // I-04 op papier (A8): de gele regel is gematcht (catalogus 226) én heeft een
  // dagprijs (199). De dagprijs staat op het klantstuk; de catalogusprijs staat er
  // NERGENS — niet als stukprijs (226,00), niet als regeltotaal (1.808,00) en niet in
  // het eindtotaal (5.528,00). Precies dát is wat een omgedraaide voorkeur zou stukmaken.
  expect(text).toContain("199,00"); // stukprijs = dagprijs
  expect(text).not.toContain("226,00");
  expect(text).not.toContain("1.808,00");
  expect(text).not.toContain("5.528,00");

  // paars (2×500) mag NERGENS als 1.000,00 opduiken en samen blijft 5.672,00
  expect(text).not.toContain("1.000,00");
  expect(text).not.toContain("6.672,00");

  // p.m.-sectie: blauw = merk inladen (ons), rood = terug naar klant, paars gemeld,
  // open = nog niet gematcht. Élke niet-tellende status krijgt hier een eigen punt —
  // anders staat er "p.m." naast een regel die nergens verantwoord wordt (A4).
  expect(text).toContain("p.m.");
  expect(text).toContain("load brand Kreon (us)");
  expect(text).toContain("back to customer");
  expect(text).toContain("outside assortment");
  expect(text).toContain("Lo400 — not matched yet — Modular Smart Tubed 82 (no product chosen)");

  // Verantwoordingsregel onder het eindtotaal: open telt mee in het p.m.-aantal.
  expect(text).toContain("Shown, not totaled (blue 1 · red 1 · purple 1 · open 1) — p.m.");

  // Voettekst: de uitleg noemt élke niet-tellende status, dus ook open. (De regel
  // wordt afgebroken over meerdere tekstregels — daarom genormaliseerde witruimte.)
  const flat = text.replace(/\s+/g, " ");
  expect(flat).toContain("Only green and yellow count;");
  expect(flat).toContain("blue, red, purple and open are shown as p.m.");

  // afwijkingsnotitie (C-07) als subregel, mét het auto-door-label (B3) erachter
  expect(text).toContain("3000K i.p.v. 2700K");
  expect(text).toContain("automatically accepted near-match");

  // zones als groepskoppen
  expect(text).toContain("ZONE A-08");
  expect(text).toContain("ZONE B-02");
});

test("extreem lange productnaam: geen crash, afgebroken met ellipsis", async () => {
  const db = await createTestDb();
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Lange-namen-project", customer: null })
    .returning();
  const lang = `SUPERLANGE ARMATUURNAAM ${"PENDEL-OPBOUW-INBOUW ".repeat(15)}STAARTMARKER`;
  const p = await seedBrandProduct(db, {
    brand: "XAL",
    name: lang,
    price: "100.00",
    articleCode: "L-LANG",
  });
  await db.insert(specLines).values({
    dossierId: dossier.id,
    fixtureCode: "Lp001",
    status: "groen",
    quantity: 2,
    matchedProductId: p.productId,
    sortOrder: 0,
  });

  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossier.id))!;
  const bytes = await renderEstimatePdf(data); // mag niet crashen
  const text = await pdfText(bytes);

  expect(text).toContain("SUPERLANGE ARMATUURNAAM"); // begin blijft leesbaar
  expect(text).toContain("…"); // afgebroken met ellipsis…
  expect(text).not.toContain("STAARTMARKER"); // …dus de staart valt weg
});

test("meerpaginasteun: veel regels → meerdere pagina's, kolomkoppen herhaald", async () => {
  const db = await createTestDb();
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Groot project", customer: "BAM" })
    .returning();
  const p = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100",
    price: "50.00",
    articleCode: "L360",
  });
  await db.insert(specLines).values(
    Array.from({ length: 80 }, (_, i) => ({
      dossierId: dossier.id,
      fixtureCode: `Lp${String(i + 1).padStart(3, "0")}`,
      status: "groen" as const,
      quantity: 1,
      matchedProductId: p.productId,
      sortOrder: i,
    })),
  );

  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossier.id))!;
  const bytes = await renderEstimatePdf(data);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  expect(pdf.numPages).toBeGreaterThanOrEqual(2);

  // kolomkoppen herhaald op de vervolgpagina (meerpaginasteun)
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  expect(pages[1]).toContain("Description");
  expect(pages[1]).toContain("Line total");

  // paginanummers aanwezig
  expect(pages[0]).toContain(`Page 1 of ${pages.length}`);

  // eindtotaal: 80 × 1 × 50 = 4.000,00
  expect(pages.join("\n")).toContain("4.000,00");
});
