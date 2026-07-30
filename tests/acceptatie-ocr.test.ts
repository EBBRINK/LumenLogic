// Acceptatietest end-to-end OCR beeld-PDF (plan-ocr-beeld-pdf, bouwstap 8): de
// volledige OCR-keten op PGlite (zelfde migraties als Neon) met een gemockte
// vision-client — het spiegelbeeld van tests/acceptatie-aanvraag-estimate.test.ts.
//
// De keten: project → startOcrRun → 3 pagina's processOcrPage (mock levert regels
// die groen/geel/rood landen) → finishOcrRun (transcript, ocr_done, kosten) →
// B7-review-semantiek (elke OCR-regel zonder matcher-flag krijgt reviewKind 'ocr';
// matcher-geel houdt 'geel') → B8-gating (open OCR-review = onzichtbaar voor het
// vangnet; ná decideReview triggert de review-flow het vangnet en doet de regel
// weer mee) → rood-werkvoorraad → generateQuote + estimate-PDF met de OCR-regels.
//
// Verwachte landing van de drie gelezen boekregels (catalogus hieronder geseed):
//   groen  Lp301 — XAL SASSO 100 SQ SP CEIL 3000K (exacte kelvin) → reviewKind 'ocr'
//   geel   Lw102 — Axo Light NEST 3000K 8W tegen twee NEST-varianten van 10 W
//                  (25% afwijking, twee schone kandidaten → ambigu, geen auto-door)
//                  → matcher zet reviewKind 'geel'; de OCR-flag komt er NIET overheen
//   rood   Lr701 — Flos ORIONNOVA (merk wél in de catalogus, product niet)
//                  → reviewKind 'ocr'
//
// De tests zijn ÉÉN doorlopend verhaal en draaien in volgorde (vitest draait tests
// binnen een bestand serieel); latere stappen bouwen op eerdere. Dit is een bewust,
// bestaand patroon (predateert PR #4) — inclusief de test "generateQuote +
// estimate-PDF: OCR-regels zichtbaar" verderop, die leunt op de review-beslissingen
// uit de voorgaande stappen. Los draaien van die ene test (bv. via `-t`) faalt dus
// nog steeds op een leeg dossier; dat is ongewijzigd gedrag, geen regressie van deze
// PR. Alleen het SASSO/RET-Waalhaven describe-blok verderop (§"inhoudsopgave
// verdringt specs niet meer") is losgetrokken in een eigen beforeAll, juist omdat
// dat blok als geïsoleerd reproductiescenario is opgezet — niet als vervolg op dit
// hoofdverhaal.
import { beforeAll, describe, expect, test } from "vitest";
import { asc, eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { events, llmUsage, specLineCandidates, specLines } from "@/db/schema";
import {
  addProductToBrand,
  createTestDb,
  seedBrandProduct,
  type TestDb,
} from "@/db/test-db";
import type { OcrClient, OcrResponse } from "@/lib/ai/ocr";
import { runVangnet, type VangnetClient, type VangnetResponse } from "@/lib/ai/vangnet";
import { renderEstimatePdf } from "@/lib/pdf/estimate";
import { createDossier, generateQuote, getQuote } from "@/lib/repo/dossiers";
import { getEstimateData } from "@/lib/repo/estimate";
import { getImportRun } from "@/lib/repo/imports";
import { finishOcrRun, processOcrPage, startOcrRun } from "@/lib/repo/ocr";
import { decideReview, getRedLinkLines, getReviewQueue } from "@/lib/repo/review";

const ACTOR = "hello@noplasticfloralfoam.com";
// 2000 in + 300 uit per pagina → (2000×€1 + 300×€5)/1M = €0,0035 (EUR≈USD-aanname).
const USAGE = { input_tokens: 2000, output_tokens: 300 };
const PAGE_COST = 0.0035;
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

// ── Gedeelde toestand van het verhaal ────────────────────────────────────────
let db: TestDb;
let dossierId: string;
let runId: string;
let nestWhiteId: string; // Axo Light NEST WHITE — de review-keuze op de gele regel

// ── Mocks ────────────────────────────────────────────────────────────────────
// Vision-mock: één geforceerde lever_regels-call per pagina (zelfde vorm als de
// echte client teruggeeft); de kosten lopen via het echte reserverings-/update-pad.
function ocrMock(regels: unknown): OcrClient {
  return {
    async createMessage(): Promise<OcrResponse> {
      return {
        content: [
          { type: "tool_use", id: "tu_1", name: "lever_regels", input: { regels } },
        ],
        stop_reason: "tool_use",
        usage: USAGE,
      };
    },
  };
}

// Vangnet-mock: per regel meteen een leeg eindantwoord (geen suggesties nodig —
// deze test toetst de SELECTIE/gating, niet de suggestie-flow).
function vangnetMock(responses: number): VangnetClient {
  let left = responses;
  return {
    async createMessage(): Promise<VangnetResponse> {
      if (left-- <= 0) throw new Error("vangnet-mock: geen respons meer in het script");
      return {
        content: [{ type: "text", text: '{"suggesties":[]}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    },
  };
}

async function eventsByAction(action: string) {
  return db.select().from(events).where(eq(events.action, action));
}

async function lineByCode(code: string) {
  const rows = await db
    .select()
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))
    .orderBy(asc(specLines.sortOrder));
  const row = rows.find((r) => r.fixtureCode === code);
  if (!row) throw new Error(`line ${code} not found`);
  return row;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// Catalogus-seed: het kleine evenbeeld waar de drie gelezen regels op landen.
beforeAll(async () => {
  db = await createTestDb();

  // XAL SASSO — exacte kelvin → Lp301 groen.
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "300.00",
    articleCode: "L360-SASSO100",
    kelvin: 3000,
  });
  // Axo Light NEST in twee kleurvarianten (10 W) — gevraagd 8 W = 25% afwijking:
  // twee schone gele kandidaten → ambigu → matcher-review 'geel' (geen auto-door).
  const nest = await seedBrandProduct(db, {
    brand: "Axo Light",
    name: "NEST SEMI-RECESSED 3000K WHITE",
    price: "180.00",
    kelvin: 3000,
    maxWattage: 10,
    color1: "white",
  });
  nestWhiteId = nest.productId;
  await addProductToBrand(db, {
    brandId: nest.brandId,
    priceListId: nest.priceListId,
    name: "NEST SEMI-RECESSED 3000K BLACK",
    price: "180.00",
    kelvin: 3000,
    maxWattage: 10,
    color1: "black",
  });
  // Flos: alleen Bellhop — de gevraagde ORIONNOVA (Lr701) bestaat niet → rood.
  await seedBrandProduct(db, {
    brand: "Flos",
    name: "Bellhop Glass C2",
    price: "180.00",
  });

  const dossier = await createDossier(db, {
    name: "Renovatie Museumdepot Beeldboek",
    customer: "Deerns Nederland B.V.",
    actor: ACTOR,
  });
  dossierId = dossier.id;
}, 120_000);

// ── Stap 1 — OCR-run: 3 pagina's met de gemockte vision-client ───────────────
test("startOcrRun → 3× processOcrPage → finishOcrRun: regels, dedupe, transcript", async () => {
  const { run, resumed } = await startOcrRun(db, {
    dossierId,
    filename: "deerns-beeldboek.pdf",
    pageCount: 3,
    actor: ACTOR,
  });
  runId = run.id;
  expect(resumed).toBe(false);
  expect(run.source).toBe("ocr");
  expect(run.ocrStatus).toBe("bezig");
  expect((await eventsByAction("ocr_started"))).toHaveLength(1);

  // Pagina 1: de groene regel.
  const p1 = await processOcrPage(db, {
    runId,
    page: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: ocrMock([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100 SQ SP CEIL 3000K",
        ruwe_tekst: "Lp301 XAL SASSO 100 SQ SP CEIL 3000K",
      },
    ]),
    actor: ACTOR,
  });
  expect(p1).toMatchObject({ created: 1, duplicates: 0, costEur: PAGE_COST });

  // Pagina 2: de gele regel (twee schone NEST-kandidaten → review 'geel').
  const p2 = await processOcrPage(db, {
    runId,
    page: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: ocrMock([
      {
        armatuurcode: "Lw102",
        merk: "Axo Light",
        type: "NEST SEMI-RECESSED 3000K 8W",
        ruwe_tekst: "Lw102 Axo Light NEST SEMI-RECESSED 3000K 8W",
      },
    ]),
    actor: ACTOR,
  });
  expect(p2).toMatchObject({ created: 1, duplicates: 0 });

  // Pagina 3: de rode regel + een duplicaat van Lp301 (één code = één spec-regel).
  const p3 = await processOcrPage(db, {
    runId,
    page: 3,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    width: 1568,
    height: 1000,
    client: ocrMock([
      {
        armatuurcode: "Lr701",
        merk: "Flos",
        type: "ORIONNOVA TURVA 90",
        ruwe_tekst: "Lr701 Flos ORIONNOVA TURVA 90",
      },
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100 SQ SP CEIL 3000K",
        ruwe_tekst: "Lp301 XAL SASSO 100 SQ SP CEIL 3000K (nogmaals)",
      },
    ]),
    actor: ACTOR,
  });
  expect(p3).toMatchObject({ created: 1, duplicates: 1 });

  // Afronden: eerlijk transcript (B6) + ocr_done met totalen.
  const finished = await finishOcrRun(db, { runId, actor: ACTOR });
  expect(finished.ocrStatus).toBe("klaar");
  const md = finished.rawMarkdown!;
  expect(md).toContain("# OCR transcript (model output)");
  expect(md).toContain("not the source document");
  expect(md).toContain("## Page 1");
  expect(md).toContain("Lw102 Axo Light NEST SEMI-RECESSED 3000K 8W");
  expect(md).toContain("Lp301 XAL SASSO 100 SQ SP CEIL 3000K (nogmaals)");

  const run2 = await getImportRun(db, runId);
  expect(run2!.counts).toMatchObject({ total: 4, checked: 3, pageCount: 3 });
}, 120_000);

// ── Stap 2 — B7-semantiek: bron, pagina, review-flags ────────────────────────
test("B7: source ocr + sourcePage; groen/rood → reviewKind 'ocr', matcher-geel blijft 'geel'", async () => {
  const lp301 = await lineByCode("Lp301");
  const lw102 = await lineByCode("Lw102");
  const lr701 = await lineByCode("Lr701");

  for (const l of [lp301, lw102, lr701]) {
    expect(l.source).toBe("ocr");
    expect(l.importRunId).toBe(runId);
    expect(l.sourceConfidence).toBe("middel"); // B3: nooit doen alsof (constante)
  }
  expect(lp301.sourcePage).toBe(1);
  expect(lw102.sourcePage).toBe(2);
  expect(lr701.sourcePage).toBe(3);

  // Statussen zoals ontworpen.
  expect(lp301.status).toBe("groen");
  expect(lw102.status).toBe("geel");
  expect(lr701.status).toBe("rood");

  // B7: "OCR goed gelezen" en "match akkoord" zijn twee besluiten — één review per
  // regel. De matcher-gele regel houdt 'geel' (de gele kaart toont de bron erbij);
  // groen en rood krijgen de OCR-controle.
  expect(lp301.reviewKind).toBe("ocr");
  expect(lw102.reviewKind).toBe("geel");
  expect(lr701.reviewKind).toBe("ocr");

  // Alle drie staan in de wachtrij; de rode staat NIET in de handmatig-linken-
  // werkvoorraad zolang zijn OCR-review openstaat (eerst de bron zien).
  const queue = await getReviewQueue(db, dossierId);
  expect(queue.pending.map((p) => p.fixtureCode).sort()).toEqual(
    ["Lp301", "Lr701", "Lw102"].sort(),
  );
  // De OcrCard-herkomst zit op de wachtrij-items (pagina + run voor de beeldlink).
  const ocrItem = queue.pending.find((p) => p.fixtureCode === "Lp301")!;
  expect(ocrItem.sourcePage).toBe(1);
  expect(ocrItem.importRunId).toBe(runId);
  // UX-audit 30 jul: de vlag geldt per PAGINA — pagina 1 van deze run heeft een
  // beeldrij, dus de kaart mag de beeldlink dragen.
  expect(ocrItem.hasPageImage).toBe(true);
  // …en de kaart krijgt de ruwe tabelregel mee om de lezing tegen te vergelijken.
  // Lp301 staat óók op pagina 3 (duplicaat "(nogmaals)"): de wachtrij citeert de rij
  // van de eigen source_page, dus niet het duplicaat. LET OP — dit is de gezonde
  // situatie, waarin álle criteria (arrayvolgorde, pagina, checked) naar dezelfde rij
  // wijzen; deze assertie pint de resolutielogica dus NIET. Dat doet
  // "wachtrij citeert de rij van de EIGEN pagina" in het SASSO-blok onderaan, waar de
  // arrayvolgorde bewust naar de verkeerde rij wijst (reviewronde 2, 30 jul).
  expect(ocrItem.sourceText).toBe("Lp301 XAL SASSO 100 SQ SP CEIL 3000K");
  expect(ocrItem.sourceText).not.toContain("(nogmaals)");
  // De matcher-gele regel is geen OCR-review → geen brontekst opgehaald.
  expect(queue.pending.find((p) => p.fixtureCode === "Lw102")!.sourceText).toBeNull();
  expect(await getRedLinkLines(db, dossierId)).toHaveLength(0);
}, 30_000);

// ── Stap 3 — kosten & audit: llm_usage per run, events-keten, vangnet stil ───
test("kosten in llm_usage mét importRunId; events-keten compleet; vangnet niet gedraaid", async () => {
  // Drie pagina-calls, elk purpose 'ocr' + importRunId, reservering bijgewerkt
  // naar de echte tokenkosten (€0,0035 — niet de reserverings-€0,02).
  const usage = await db.select().from(llmUsage);
  expect(usage).toHaveLength(3);
  for (const u of usage) {
    expect(u.purpose).toBe("ocr");
    expect(u.importRunId).toBe(runId);
    expect(Number(u.costEur)).toBeCloseTo(PAGE_COST, 6);
  }

  // Events-keten (ijzeren regel 5): start → per pagina → done, met totalen.
  expect(await eventsByAction("ocr_started")).toHaveLength(1);
  expect(await eventsByAction("ocr_page_done")).toHaveLength(3);
  const done = await eventsByAction("ocr_done");
  expect(done).toHaveLength(1);
  expect(done[0].payload).toMatchObject({ pages: 3, regels: 3, rowsRead: 4 });
  expect((done[0].payload as { costEur: number }).costEur).toBeCloseTo(
    3 * PAGE_COST,
    6,
  );
  // De matcher draaide over élke nieuwe regel.
  expect(await eventsByAction("matched_status")).toHaveLength(3);

  // B8: de OCR-flow heeft het vangnet NIET getriggerd — geen run, geen skip.
  expect(await eventsByAction("ai_vangnet_run")).toHaveLength(0);
  expect(await eventsByAction("ai_vangnet_skipped_no_key")).toHaveLength(0);
}, 30_000);

// ── Stap 4 — B8-gating: open OCR-review is onzichtbaar voor het vangnet ─────
test("B8: vangnet slaat regels met een open OCR-review over", async () => {
  // Restregels zonder gating zouden zijn: Lw102 (geel-in-review) en Lr701 (rood).
  // Lr701 draagt een ÓPEN OCR-review → uitgesloten; alleen Lw102 gaat langs de AI.
  const lw102 = await lineByCode("Lw102");
  const lr701 = await lineByCode("Lr701");
  const result = await runVangnet(db, dossierId, {
    client: vangnetMock(1),
    actor: ACTOR,
  });
  expect(result.skipped).toBeUndefined();
  expect(result.checked).toEqual([lw102.id]);
  expect(result.checked).not.toContain(lr701.id);
}, 60_000);

// ── Stap 5 — reviews afronden: OCR-besluit triggert het vangnet ──────────────
test("decideReview: geel → groen zonder trigger; ocr-besluiten triggeren het vangnet", async () => {
  // 5a. De gele regel accepteren mét expliciete keuze (NEST WHITE) → groen +
  // merkteken. reviewKind was 'geel', dus GEEN vangnet-trigger.
  const lw102 = await lineByCode("Lw102");
  await decideReview(db, {
    specLineId: lw102.id,
    decision: "accepteer",
    productId: nestWhiteId,
    actor: ACTOR,
  });
  const lw102Na = await lineByCode("Lw102");
  expect(lw102Na.status).toBe("groen");
  expect(lw102Na.matchedProductId).toBe(nestWhiteId);
  // merkteken "handmatig gekozen" op de gekozen kandidaat
  const chosen = (
    await db
      .select()
      .from(specLineCandidates)
      .where(eq(specLineCandidates.specLineId, lw102.id))
  ).find((c) => c.chosen);
  expect(chosen?.chosenBy).toBe(ACTOR);
  expect(await eventsByAction("ai_vangnet_skipped_no_key")).toHaveLength(0);

  // 5b. De OCR-reviews afronden ('gecontroleerd' — status-neutraal). Elke afronding
  // van een ÓPEN ocr-review triggert het vangnet (zonder key: netjes een skip-event
  // — precies hetzelfde patroon als de import-trigger).
  const lp301 = await lineByCode("Lp301");
  await decideReview(db, {
    specLineId: lp301.id,
    decision: "gecontroleerd",
    actor: ACTOR,
  });
  expect(await eventsByAction("ai_vangnet_skipped_no_key")).toHaveLength(1);
  const lp301Na = await lineByCode("Lp301");
  expect(lp301Na.status).toBe("groen"); // status-neutraal besluit
  expect(lp301Na.reviewedAt).not.toBeNull();
  expect(lp301Na.reviewDecision).toBe("gecontroleerd");

  const lr701 = await lineByCode("Lr701");
  await decideReview(db, {
    specLineId: lr701.id,
    decision: "gecontroleerd",
    actor: ACTOR,
  });
  expect(await eventsByAction("ai_vangnet_skipped_no_key")).toHaveLength(2);
  const lr701Na = await lineByCode("Lr701");
  expect(lr701Na.status).toBe("rood"); // lezing bevestigd, match blijft er niet van komen

  // 5c. Ná de afgeronde OCR-review doet Lr701 wél mee met het vangnet (B8) én
  // verschijnt hij in de rood-werkvoorraad ("blijft rood → daarna handmatig linken").
  const result = await runVangnet(db, dossierId, {
    client: vangnetMock(1),
    actor: ACTOR,
  });
  expect(result.checked).toEqual([lr701.id]); // Lw102/Lp301 zijn groen — nooit AI
  const rood = await getRedLinkLines(db, dossierId);
  expect(rood.map((r) => r.fixtureCode)).toEqual(["Lr701"]);

  const queue = await getReviewQueue(db, dossierId);
  expect(queue.pending).toHaveLength(0);
  expect(queue.done).toHaveLength(3);
  expect(await eventsByAction("review_decided")).toHaveLength(3);
}, 60_000);

// ── Stap 6 — estimate: de OCR-regels landen in quote en PDF ──────────────────
test("generateQuote + estimate-PDF: OCR-regels zichtbaar (p/st, p.m. voor rood)", async () => {
  const year = new Date().getFullYear();
  const quote = await generateQuote(db, dossierId, ACTOR);
  expect(quote.quoteNumber).toBe(`BL-${year}-0001`);

  // Alleen de gekozen matches dragen een prijsregel: Lw102 (NEST WHITE) en Lp301
  // is groen zónder gekozen match (kiezen blijft menswerk) → geen quote-regel.
  const quoteData = await getQuote(db, dossierId);
  expect(quoteData?.lines.map((l) => l.fixtureCode)).toEqual(["Lw102"]);
  // OCR levert geen aantallen (een boekpagina noemt ze niet) → stukprijs-modus (A-07).
  expect(quoteData?.lines[0].quantity).toBe(0);

  const data = (await getEstimateData(db, dossierId))!;
  expect(data.lines).toHaveLength(3); // álle OCR-regels — niets stilzwijgend weg
  expect(data.computed.pm.rood).toBe(1);

  const bytes = await renderEstimatePdf(data);
  const text = await pdfText(bytes);
  expect(text).toContain(`BL-${year}-0001`);
  expect(text).toContain("Renovatie Museumdepot Beeldboek");
  // De drie OCR-regels staan er, mét de gelezen teksten uit het beeldboek.
  expect(text).toContain("Lp301");
  expect(text).toContain("Lw102");
  expect(text).toContain("Lr701");
  expect(text).toContain("NEST SEMI-RECESSED 3000K WHITE");
  expect(text).toContain("p/st"); // ontbrekend aantal = stukprijs-modus
  expect(text).toContain("back to customer"); // rood = p.m., nooit opgeteld
}, 120_000);

// ── SASSO/RET-Waalhaven-acceptatietest (docs/probleem-ocr-toc-verdringt-specs.md) ──
// Reproduceert het ECHTE probleem-scenario (niet de synthetische unit-tests van
// bouwstap 2): een boek met een inhoudsopgave-rij vóór de detailpagina van dezelfde
// armatuurcode. Eigen db/dossier/run — draait los van het verhaal hierboven en
// stoort dat niet (los describe-blok, geen gedeelde module-state).
describe("SASSO-acceptatietest: inhoudsopgave verdringt specs niet meer", () => {
  let sassoDb: TestDb;
  let sassoDossierId: string;
  let sassoRunId: string;
  let lp301Na1: Awaited<ReturnType<typeof sassoLineByCode>>;
  let lp301Na2: Awaited<ReturnType<typeof sassoLineByCode>>;
  let p1Result: Awaited<ReturnType<typeof processOcrPage>>;
  let p2Result: Awaited<ReturnType<typeof processOcrPage>>;

  // CodeRabbit (PR #4, Minor): de volledige scenario-opbouw (run starten, beide
  // pagina's verwerken, tussenresultaten vastleggen) staat hier in ÉÉN beforeAll —
  // niet meer verspreid over een eerste test() waar een latere test op leunde.
  // `bun vitest run -t "generateQuote/estimate"` (of elke andere filter/losse
  // testrun) bouwt het dossier dus altijd zelf op, ongeacht welke test() erna
  // daadwerkelijk draait.
  beforeAll(async () => {
    sassoDb = await createTestDb();

    // Brink voert de XAL SASSO 100 ALLEEN in 2700K/CRI90/17,9W — exact zoals Timo
    // zelf uit het echte boek las (zie probleemdocument). Geen 3000K/4000K-variant.
    await seedBrandProduct(sassoDb, {
      brand: "XAL",
      name: "SASSO 100 SQ SP CEIL 2700K",
      price: "300.00",
      articleCode: "L360-SASSO100-2700",
      kelvin: 2700,
      cri: 90,
      maxWattage: 17.9,
    });

    const dossier = await createDossier(sassoDb, {
      name: "RET Waalhaven (Deerns-beeldboek, SASSO-reproductie)",
      customer: "Deerns Nederland B.V.",
      actor: ACTOR,
    });
    sassoDossierId = dossier.id;

    const { run } = await startOcrRun(sassoDb, {
      dossierId: sassoDossierId,
      filename: "ret-waalhaven-deerns.pdf",
      pageCount: 2,
      actor: ACTOR,
    });
    sassoRunId = run.id;

    // Pagina 1 — inhoudsopgave-stijl: code, merk, type, GEEN cijfers/eenheden. Het
    // "8" is een paginaverwijzing uit de inhoudsopgave, geen spec (zie
    // probleemdocument, "Oorzaak").
    p1Result = await processOcrPage(sassoDb, {
      runId: sassoRunId,
      page: 1,
      imageBytes: IMAGE,
      mime: "image/jpeg",
      width: 1568,
      height: 1000,
      client: ocrMock([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100 8",
        },
      ]),
      actor: ACTOR,
    });
    lp301Na1 = await sassoLineByCode("Lp301");

    // Pagina 2 — detailpagina-stijl, ZELFDE code: volledige specs zoals echt in het
    // boek. LET OP: "CRI ≥ 90" zonder dubbele punt vóór het ≥-symbool — parseCri()
    // (lib/enrichment/parser.ts) matcht "CRI\s*(?:≥|>=|>)?\s*(\d+)"; een letterlijke
    // dubbele punt tussen "CRI" en "≥" ("CRI: ≥ 90") breekt die match (geen \s* over
    // een ":"), dus zou hier zelf weer als "geen CRI gelezen" landen. Dat is een
    // BEKEND, NOG NIET GEFIXT parser-gat (los van dit ticket over TOC-verdringing) —
    // deze test omzeilt het bewust met "CRI ≥ 90" (geen dubbele punt), zoals het
    // echte boek de rest van de specs ook zonder leestekens tussen label en waarde
    // toont ("Vermogen: 17,9 W." heeft de ruimte wél na de dubbele punt, dat botst
    // niet met \s*).
    p2Result = await processOcrPage(sassoDb, {
      runId: sassoRunId,
      page: 2,
      imageBytes: IMAGE,
      mime: "image/jpeg",
      width: 1568,
      height: 1000,
      client: ocrMock([
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst:
            "Lp301 XAL SASSO 100 Vermogen: 17,9 W. Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        },
      ]),
      actor: ACTOR,
    });
    lp301Na2 = await sassoLineByCode("Lp301");

    await finishOcrRun(sassoDb, { runId: sassoRunId, actor: ACTOR });
  }, 120_000);

  test("inhoudsopgave-rij (arm) → detailpagina-rij (rijk) upgradet dezelfde regel naar rood", async () => {
    expect(await sassoEventsByAction("ocr_started")).toHaveLength(1);
    expect(p1Result).toMatchObject({ created: 1, duplicates: 0 });
    expect(lp301Na1.reqKelvin).toBeNull();
    expect(lp301Na1.reqWatt).toBeNull();
    expect(lp301Na1.reqCri).toBeNull();

    // Zelfde armatuurcode binnen dezelfde run → geen nieuwe regel (created:0), maar
    // een upgrade van de bestaande (item A: rijkste-wint-dedup, niet eerste-wint).
    expect(p2Result).toMatchObject({ created: 0, duplicates: 0, upgraded: 1 });

    // DEZELFDE regel (zelfde id) — geen tweede rij voor dezelfde code.
    expect(lp301Na2.id).toBe(lp301Na1.id);
    expect(lp301Na2.reqKelvin).toBe(3000);
    expect(lp301Na2.reqCri).toBe(90);
    // numeric(8,2)-kolom: drizzle/pg geeft numerics als string terug, met 2 decimalen.
    expect(lp301Na2.reqWatt).toBe("17.90");

    // DE KERNREPARATIE: vóór de fix zou dit GROEN zijn gebleven — zonder gevraagde
    // kelvin genereert de tolerantietabel voor dat veld helemaal geen deviation
    // (judgeCandidate geeft kelvin pas door aan judgeKelvin als req.kelvin != null).
    // Nu de detailpagina de kelvin-eis (3000) heeft laten doorkomen, ziet de matcher
    // de mismatch met wat Brink levert (XAL SASSO 100 2700K) en wijst terecht af:
    // ROOD. Vóór de fix (zie probleemdocument, "Gevolg voor de matcher"): geen
    // zichtbare afwijking (mogelijk ten onrechte groen), want reqKelvin bleef null
    // (de inhoudsopgave-lezing won altijd) → er was niets om op te toetsen.
    expect(lp301Na2.status).toBe("rood");

    // Event-keten compleet (ijzeren regel 5): start, 2× page_done, done, en de
    // upgrade zelf met bewaarde rijkdom-sprong (0 → ≥1).
    expect(await sassoEventsByAction("ocr_started")).toHaveLength(1);
    expect(await sassoEventsByAction("ocr_page_done")).toHaveLength(2);
    expect(await sassoEventsByAction("ocr_done")).toHaveLength(1);
    const upgraded = await sassoEventsByAction("ocr_line_upgraded");
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0].payload).toMatchObject({
      fixtureCode: "Lp301",
      oldRichness: 0,
    });
    expect(
      (upgraded[0].payload as { newRichness: number }).newRichness,
    ).toBeGreaterThanOrEqual(1);
  }, 120_000);

  // Reviewronde 2 (30 jul), F5: hier draaien arrayvolgorde en waarheid tégen elkaar in.
  // import_runs.rows staat na dit scenario als [pagina 1 (inhoudsopgave, checked:false
  // na de upgrade), pagina 2 (detailpagina, checked:true)], terwijl de spec-regel op
  // source_page 2 staat. Wie "de eerste rij met deze armatuurcode" pakt (of het
  // pagina-/checked-criterium sloopt) krijgt hier de ARME inhoudsopgave-tekst te zien —
  // en die zou de reviewer laten aftekenen tegen het verkeerde bewijs. De eerdere versie
  // van deze acceptatie pinde dat niet: daar wees álles naar dezelfde rij.
  test("wachtrij citeert de rij van de EIGEN pagina, niet de eerste rij met dezelfde code", async () => {
    const queue = await getReviewQueue(sassoDb, sassoDossierId);
    const kaart = queue.pending.find((p) => p.fixtureCode === "Lp301")!;
    expect(kaart.sourcePage).toBe(2); // de detailpagina won de dedup
    expect(kaart.sourceText).toBe(
      "Lp301 XAL SASSO 100 Vermogen: 17,9 W. Kleurtemperatuur: 3000 K. CRI ≥ 90.",
    );
    // De inhoudsopgave-regel van pagina 1 staat vóóraan in rows en mag niet lekken.
    expect(kaart.sourceText).not.toBe("Lp301 XAL SASSO 100 8");
    // En het beeld van díe pagina bestaat, dus de kaart mag de beeldlink dragen.
    expect(kaart.hasPageImage).toBe(true);
  }, 60_000);

  test("generateQuote/estimate: de SASSO-regel staat p.m. rood, niet geprijsd groen", async () => {
    await generateQuote(sassoDb, sassoDossierId, ACTOR);

    // Rood + geen match → geen prijsregel in de offerte (E-02: alleen groen/geel
    // met een geldige prijs tellen mee).
    const quoteData = await getQuote(sassoDb, sassoDossierId);
    expect(quoteData?.lines ?? []).toHaveLength(0);

    const data = (await getEstimateData(sassoDb, sassoDossierId))!;
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].fixtureCode).toBe("Lp301");
    expect(data.lines[0].status).toBe("rood");
    // p.m. — dit is het bewijs dat de fix ook echt doorwerkt naar wat Timo ziet:
    // de SASSO-regel staat als niet-geprijsde rood-regel, niet als geprijsde groen.
    expect(data.computed.pm.rood).toBe(1);
    expect(data.computed.totals.samen).toBe(0);
  }, 60_000);

  // ── Lokale helpers (eigen db, niet de module-scoped `db`/`dossierId` hierboven) ──
  async function sassoEventsByAction(action: string) {
    return sassoDb.select().from(events).where(eq(events.action, action));
  }

  async function sassoLineByCode(code: string) {
    const rows = await sassoDb
      .select()
      .from(specLines)
      .where(eq(specLines.dossierId, sassoDossierId))
      .orderBy(asc(specLines.sortOrder));
    const row = rows.find((r) => r.fixtureCode === code);
    if (!row) throw new Error(`line ${code} not found`);
    return row;
  }
});
