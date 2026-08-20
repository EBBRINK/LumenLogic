// Acceptatietest end-to-end (plan stap 10): de volledige kernflow aanvraag → estimate,
// als integratietest op PGlite (zelfde migraties als Neon) met het ÉCHTE
// test-armaturenboek (docs/examples/test-armaturenboek.pdf, 20 regels).
//
// De keten: project aanmaken → PDF importeren (recordPdfImport met echte
// parseSpecLinesFromPages-output incl. markdown-controlespoor) → matcher
// (vijfstatussen + geel auto-door, B3) → AI-vangnet met gemockte client (B4,
// suggesties-only) → review afronden (accepteer / variant / handmatig linken) →
// estimate genereren + PDF terugleesbaar (unpdf) → statusflow (estimate_gestuurd
// bevriest, gegund → awarded) → events-audittrail compleet.
//
// De catalogus wordt hier bewust zó geseed dat elke regel van het boek op zijn
// bedoelde status landt (het boek is tegen de echte Neon-catalogus ontworpen;
// deze test draagt zijn eigen, kleinere evenbeeld daarvan). Verwachte verdeling
// direct na import — gedocumenteerd conform scripts/gen-test-armaturenboek.ts:
//
//   groen  4× — Lp301, Ld201, Lp501, Ld105 (elk mét een getoetste kelvin-eis, en elk
//               met precies ÉÉN groene kandidaat) → het systeem zet ze zélf vast:
//               chosenBy 'system:auto' + event certain_match_auto_accepted
//   open   4× — Lp302 (SCAVA), Ls001 (Bellhop), Lp401 (TAGLIO), Ls010 (MELAMPO):
//               hun boekregel draagt géén toetsbare spec — sinds gat A (20 jul)
//               is "aantoonbaar voldoet" zonder één getoetste eis onmogelijk; de
//               merk-gescoopte kandidaten staan als lijst 2, de mens kiest met reden
//   geel   6× — waarvan:
//     • 3× AUTO-DOOR (B3: precies één schoon-gele kandidaat, geen keuzeveld):
//       Ld202 (watt 40→32 = 20%), Ld106 (30→24 = 20%), Ld107 (28→24 = 14%)
//       → chosenBy 'system:auto' + event near_match_auto_accepted
//     • 3× IN REVIEW (twee kandidaten → ambigu, geen auto-door):
//       Lw102 (watt 8→10 = 25%), Lw103 (9→10 = 11%) — twee schoon-gele
//       NEST-kleurvarianten; en Lw101, die twee even GROENE NEST-kandidaten heeft
//       en tot 12 aug 2026 groen heette (goal-groen-betekent-zeker)
//   rood   2× — Lp601, Lr701 (merk wél in catalogus, product niet)
//   blauw  2× — Lp801, Ls802 (merkrij zonder producten geseed — zie beforeAll; sinds
//               stap 4/O5 toetst de engine op prodúcten in de basistabel: een kale
//               merkrij is een datagat → blauw + inlaadwachtrij, precies zoals
//               docs/matching-regelset.md:77-79 het definieert)
//   paars  2× — Lx901 (stoel), Lx902 (kast) — geen verlichting
//
// De tests in dit bestand zijn ÉÉN doorlopend verhaal en draaien in volgorde
// (vitest draait tests binnen een bestand serieel); latere stappen bouwen op
// eerdere.
import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import boekUrl from "@/docs/examples/test-armaturenboek.pdf?url";
import {
  aiSuggestions,
  brandLoadQueue,
  brands,
  events,
  llmUsage,
} from "@/db/schema";
import {
  addProductToBrand,
  createTestDb,
  seedBrand,
  seedBrandProduct,
  type TestDb,
} from "@/db/test-db";
import { beslisRoute } from "@/lib/ai/leesroute";
import {
  runVangnet,
  VANGNET_MODEL,
  type VangnetClient,
} from "@/lib/ai/vangnet";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import { renderEstimatePdf } from "@/lib/pdf/estimate";
import {
  createDossier,
  generateQuote,
  getDossier,
  getQuote,
  getSpecLines,
} from "@/lib/repo/dossiers";
import { getEstimateData } from "@/lib/repo/estimate";
import { recordPdfImport } from "@/lib/repo/imports";
import { setStatus } from "@/lib/repo/project-status";
import {
  decideReview,
  getReviewQueue,
  linkManualProduct,
} from "@/lib/repo/review";
import { ALLE_DOSSIERS } from "@/lib/repo/toegang";

const ACTOR = "tester@voorbeeld.nl";

// ── Gedeelde toestand van het verhaal ────────────────────────────────────────
let db: TestDb;
let dossierId: string;
// Product-ids die de review-stappen nodig hebben.
let sassoId: string; // XAL SASSO (doel van het handmatig linken op rood)
let nestWhiteId: string; // Axo Light NEST WHITE (de expliciete variantkeuze)
let nestBlackId: string;

type Row = Awaited<ReturnType<typeof getSpecLines>>[number];
async function lineByCode(code: string): Promise<Row> {
  const rows = await getSpecLines(db, dossierId);
  const row = rows.find((r) => r.fixtureCode === code);
  if (!row) throw new Error(`line ${code} not found`);
  return row;
}

async function eventsByAction(action: string) {
  return db.select().from(events).where(eq(events.action, action));
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// Catalogus-seed: het kleine evenbeeld van de echte catalogus waar het
// test-armaturenboek tegen ontworpen is. Prijzen bewust rond gekozen zodat de
// totalen op de estimate-PDF eenduidig terug te lezen zijn.
beforeAll(async () => {
  db = await createTestDb();

  // XAL: twee producten — SASSO (groen Lp301) en UNICO (groen Ld105 + auto-door
  // Ld106/Ld107: gevraagd 30W/28W tegen geleverd 24W = geel).
  const xal = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "300.00",
    articleCode: "L360-SASSO100",
    kelvin: 3000,
  });
  sassoId = xal.productId;
  await addProductToBrand(db, {
    brandId: xal.brandId,
    priceListId: xal.priceListId,
    name: "UNICO Q4 2700K",
    price: "120.00",
    articleCode: "L360-UNICOQ4",
    kelvin: 2700,
    maxWattage: 24,
  });

  await seedBrandProduct(db, {
    brand: "Wever & Ducré",
    name: "SCAVA 1.0 WALL",
    price: "220.00",
  });
  // Flos: alleen Bellhop — de gevraagde ORIONNOVA (Lr701) bestaat niet → rood.
  await seedBrandProduct(db, {
    brand: "Flos",
    name: "Bellhop Glass C2",
    price: "180.00",
  });
  await seedBrandProduct(db, {
    brand: "TAL",
    name: "TAGLIO CORNER",
    price: "150.00",
  });
  // Kreon Holon: groen op Ld201 (alleen kelvin gevraagd) en auto-door op Ld202
  // (gevraagd 40W, geleverd 32W = 20% → geel, één schone kandidaat).
  await seedBrandProduct(db, {
    brand: "Kreon",
    name: "Holon 80 directional 3000K",
    price: "250.00",
    kelvin: 3000,
    maxWattage: 32,
  });
  // Axo Light NEST in twee kleurvarianten → Lw102/Lw103 hebben TWEE schoon-gele
  // kandidaten en blijven dus in review (B3 weigert ambiguïteit).
  const nest = await seedBrandProduct(db, {
    brand: "Axo Light",
    name: "NEST SEMI-RECESSED 3000K WHITE",
    price: "180.00",
    kelvin: 3000,
    maxWattage: 10,
    color1: "white",
  });
  nestWhiteId = nest.productId;
  const nestBlack = await addProductToBrand(db, {
    brandId: nest.brandId,
    priceListId: nest.priceListId,
    name: "NEST SEMI-RECESSED 3000K BLACK",
    price: "180.00",
    kelvin: 3000,
    maxWattage: 10,
    color1: "black",
  });
  nestBlackId = nestBlack.productId;

  await seedBrandProduct(db, {
    brand: "Artemide",
    name: "MELAMPO W BRONZE",
    price: "140.00",
  });
  await seedBrandProduct(db, {
    brand: "Egoluce",
    name: "STAR MAXI 2700K",
    price: "160.00",
    kelvin: 2700,
  });
  // Zumtobel en Trilux als merkRIJ zonder producten — dit is nu de blauw-fixture
  // (stap 4/O5): splitBrandType herkent ze en levert de canonieke naam, maar de
  // engine toetst "bekend" op prodúcten in de basistabel. Een kale merkrij is een
  // datagat → blauw + inlaadwachtrij (het H-08-ontwerp, terug van weggeweest).
  await seedBrand(db, "Zumtobel");
  await seedBrand(db, "Trilux");
  // Vitra en USM bewust NIET geseed: paars (geen verlichting — merk doet er niet toe;
  // splitBrandType laat de volledige rest staan, dus "stoel"/"kast" blijven zichtbaar).
}, 120_000);

// ── Stap 1 — project aanmaken ────────────────────────────────────────────────
test("project aanmaken: status concept, xis_phase start, phase tender (default veilig)", async () => {
  const dossier = await createDossier(db, { orgId: null,
    name: "Nieuwbouw Kantoorpand De Boog",
    customer: "Deerns Nederland B.V.",
    actor: ACTOR,
  });
  dossierId = dossier.id;

  expect(dossier.status).toBe("concept");
  expect(dossier.xisPhase).toBe("start");
  expect(dossier.phase).toBe("tender"); // ijzeren regel 4: default = veilig

  const created = await eventsByAction("dossier_created");
  expect(created).toHaveLength(1);
  expect(created[0].actor).toBe(ACTOR);
}, 30_000);

// ── Stap 2 — PDF-import (échte parser-output, incl. markdown-controlespoor) ──
test("PDF-import: importrun bevestigd, rawMarkdown met '## Pagina', 20 regels", async () => {
  const bytes = new Uint8Array(await (await fetch(boekUrl)).arrayBuffer());
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);

  // Productiepad sinds de 413-fix: extractie (browser) → pure parsing (server).
  const pages = await extractPagesFromPdf(bytes);
  const parsed = parseSpecLinesFromPages(pages, brandNames);
  expect(parsed.hadText).toBe(true);
  expect(parsed.lines).toHaveLength(20); // het volledige boek, niets weggelaten
  expect(parsed.markdown.startsWith("## Page 1")).toBe(true);

  // Router (goal-import-ai-leesroute, stap 3): het Deerns-boek bewandelt het
  // deterministische €0-pad. De geseede catalogus geeft 18 van de 20 regels een
  // bekend merk (alleen Lx901/Lx902 — Vitra/USM, bewust niet geseed — blijven
  // leeg): 90% ≥ de 60%-drempel. De server-action zelf wordt hier bewust niet
  // e2e getest: importArmaturenboekPagesAction is precies beslisRoute +
  // recordPdfImport (deterministisch) — samen zijn ze het pad dat deze test
  // bewandelt en bewijst.
  const route = beslisRoute(parsed.lines);
  expect(route).toEqual({
    route: "deterministisch",
    bekendeMerken: 18,
    totaal: 20,
  });

  const { run, created } = await recordPdfImport(db, {
    dossierId,
    filename: "test-armaturenboek.pdf",
    lines: parsed.lines,
    rawMarkdown: parsed.markdown,
    actor: ACTOR,
  });

  expect(run.status).toBe("bevestigd");
  expect(run.source).toBe("pdf");
  expect(run.counts).toEqual({ total: 20, checked: 20 });
  expect(run.rawMarkdown).toBe(parsed.markdown);
  expect(run.rawMarkdown).toContain("## Page");
  expect(run.rawMarkdown).toContain("Armaturenboek");
  expect(created).toHaveLength(20);

  // De import triggert het vangnet automatisch; zonder ANTHROPIC_API_KEY slaat
  // dat netjes over mét event (nooit een importfout) — bewust gedrag.
  expect(await eventsByAction("ai_vangnet_skipped_no_key")).toHaveLength(1);

  // Het €0-bewijs: het deterministische pad heeft géén AI-call gedaan — geen
  // llm_usage met purpose 'leesroute' en geen enkel leesroute_*-event.
  const usage = await db.select().from(llmUsage);
  expect(usage.filter((u) => u.purpose === "leesroute")).toEqual([]);
  const alleEvents = await db.select().from(events);
  expect(alleEvents.filter((e) => e.action.startsWith("leesroute_"))).toEqual([]);
}, 120_000);

// ── Stap 3 — matcher-uitkomsten (verdeling zoals bovenaan gedocumenteerd) ────
test("matcher: 4 groen (vastgezet) · 4 open (gat A) · 6 geel (3 auto-door + 3 review) · 2 rood · 2 blauw (O5) · 2 paars", async () => {
  const rows = await getSpecLines(db, dossierId);
  const byStatus = (s: string) =>
    rows.filter((r) => r.status === s).map((r) => r.fixtureCode).sort();

  // Lw101 stond hier tot 12 aug 2026 bij groen. Hij heeft twee even groene
  // kandidaten (NEST wit + NEST zwart) en is daarmee precies het geval dat Brink
  // in de demo aanwees: "groen" was een greep uit twee. Sinds
  // goal-groen-betekent-zeker is dat geel — Brink kiest.
  expect(byStatus("groen")).toEqual(
    ["Lp301", "Ld201", "Lp501", "Ld105"].sort(),
  );
  // Gat A (20 jul): deze vier boekregels dragen géén toetsbare spec — hun
  // merk-gescoopte kandidaten zijn lijst 2 ("mogelijk — data onvolledig") en de
  // regel is open; "aantoonbaar voldoet" op nul getoetste eisen bestaat niet meer.
  expect(byStatus("open")).toEqual(
    ["Lp302", "Ls001", "Lp401", "Ls010"].sort(),
  );
  expect(byStatus("geel")).toEqual(
    ["Ld202", "Lw101", "Lw102", "Ld106", "Lw103", "Ld107"].sort(),
  );
  expect(byStatus("rood")).toEqual(["Lp601", "Lr701"].sort());
  // Blauw is per docs/matching-regelset.md:77-79 het correcte antwoord op een merk
  // zonder data: wíj moeten inladen, de klant hoeft niets. Dit is het
  // regressiebewijs van stap 4 (O5).
  expect(byStatus("blauw")).toEqual(["Lp801", "Ls802"].sort());
  expect(byStatus("paars")).toEqual(["Lx901", "Lx902"].sort());

  // B3 auto-door: Ld202/Ld106/Ld107 hebben precies één schoon-gele kandidaat
  // (kelvin exact, watt in de gele band, geen onbekende velden, geen keuzeveld)
  // → match direct gezet, chosenBy 'system:auto', GEEN review-flag.
  for (const code of ["Ld202", "Ld106", "Ld107"]) {
    const l = await lineByCode(code);
    expect(l.matchedProductId).not.toBeNull();
    expect(l.chosenBy).toBe("system:auto");
    expect(l.reviewKind).toBeNull();
    // de afwijking blijft benoemd op de regel (C-07)
    expect((l.deviations ?? []).some((d) => d.verdict === "geel")).toBe(true);
  }
  const autoEvents = await eventsByAction("near_match_auto_accepted");
  expect(autoEvents).toHaveLength(3);

  // Lw102/Lw103: twee schoon-gele kandidaten (NEST wit + zwart) → ambigu, dus
  // GEEN auto-door; ze staan in de review-wachtrij. Lw101 staat er sinds
  // goal-groen-betekent-zeker naast: twee even GROENE kandidaten, zelfde oordeel.
  for (const code of ["Lw101", "Lw102", "Lw103"]) {
    const l = await lineByCode(code);
    expect(l.matchedProductId).toBeNull();
    expect(l.reviewKind).toBe("geel");
  }
  const queue = await getReviewQueue(db, dossierId);
  expect(queue.pending.map((p) => p.fixtureCode).sort()).toEqual([
    "Lw101",
    "Lw102",
    "Lw103",
  ]);

  // Groen = "dit is hét product": het systeem zet hem zelf vast, met zichzelf als
  // kiezer. Vóór 12 aug bleef matchedProductId hier leeg en viel de regel uit de
  // offerte tot een mens op "Choose" klikte — punt 3 uit de Brink-demo.
  for (const code of ["Lp301", "Ld201", "Lp501", "Ld105"]) {
    const l = await lineByCode(code);
    expect(l.matchedProductId).not.toBeNull();
    expect(l.chosenBy).toBe("system:auto");
    expect(l.reviewKind).toBeNull();
  }
  expect(await eventsByAction("certain_match_auto_accepted")).toHaveLength(4);

  // H-08 is terug (O5): beide productloze merken staan op de inlaadwachtrij, met
  // hun genormaliseerde key, en elk blauw is als brand_load_requested gelogd.
  const queueRows = await db.select().from(brandLoadQueue);
  expect(queueRows.map((q) => q.brandKey).sort()).toEqual(["trilux", "zumtobel"]);
  expect(await eventsByAction("brand_load_requested")).toHaveLength(2);

  // Elke regel is gematcht en gelogd (ijzeren regel 5).
  expect(await eventsByAction("matched_status")).toHaveLength(20);
}, 60_000);

// ── Stap 4 — AI-vangnet met gemockte client (suggesties, nooit beslissingen) ─
// De mock doet per regel één brede zoekactie (input {} — in tender vergrendelt de
// server de zoektocht toch op het gevraagde merk) en suggereert het eerste
// toolresultaat. Restregels = geel-in-review (Lw101, Lw102, Lw103) + rood (Lp601, Lr701)
// + de vier open-regels van gat A (Lp302, Ls001, Lp401, Ls010) — het vangnet
// selecteert rood/open/geel-in-review, en open is sinds gat A het eerlijke
// antwoord op merk-zonder-specs, dus die gaan nu mee (bestaand open-gedrag).
// Blauw (Lp801/Ls802) selecteert het vangnet in tender bewust NIET (regel 4: een
// blauw-suggestie is per definitie een ander merk). Alle negen de gecheckte regels
// vinden binnen hun merk een kandidaat → 9 suggesties.
test("vangnet (mock): 9 restregels gecheckt, 9 suggesties, statussen onaangetast", async () => {
  const mockClient: VangnetClient = {
    async createMessage(params) {
      if (params.messages.length === 1) {
        return {
          content: [
            { type: "tool_use", id: "tool_1", name: "zoek_producten", input: {} },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 200, output_tokens: 30 },
        };
      }
      let productId: string | null = null;
      const last = params.messages[params.messages.length - 1];
      if (Array.isArray(last.content)) {
        for (const block of last.content) {
          if (block.type === "tool_result") {
            const parsed = JSON.parse(block.content) as {
              resultaten?: { id: string }[];
            };
            if (parsed.resultaten?.length) productId = parsed.resultaten[0].id;
          }
        }
      }
      const suggesties = productId
        ? [{ productId, rationale: "dichtstbijzijnde match binnen het gevraagde merk" }]
        : [];
      return {
        content: [{ type: "text", text: JSON.stringify({ suggesties }) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 250, output_tokens: 40 },
      };
    },
  };

  const before = new Map(
    (await getSpecLines(db, dossierId)).map((l) => [
      l.fixtureCode,
      { status: l.status, matched: l.matchedProductId, reviewKind: l.reviewKind },
    ]),
  );

  const result = await runVangnet(db, dossierId, { client: mockClient, actor: ACTOR });
  expect(result.skipped).toBeUndefined();
  // Lw101, Lw102, Lw103, Lp601, Lr701 + de vier gat-A-open-regels (blauw doet niet mee)
  expect(result.checked).toHaveLength(9);
  expect(result.suggested).toBe(9); // elk vindt binnen zijn merk een kandidaat
  expect(result.discarded).toBe(0);

  // Suggesties zijn opgeslagen, met model + rationale — en het zijn SUGGESTIES:
  // geen enkele regel is van status/match/review-flag veranderd.
  const suggestions = await db.select().from(aiSuggestions);
  expect(suggestions).toHaveLength(9);
  for (const s of suggestions) expect(s.model).toBe(VANGNET_MODEL);

  const after = await getSpecLines(db, dossierId);
  for (const l of after) {
    const prev = before.get(l.fixtureCode)!;
    expect(l.status).toBe(prev.status);
    expect(l.matchedProductId).toBe(prev.matched);
    expect(l.reviewKind).toBe(prev.reviewKind);
  }

  // Audit (regel 5): zoekacties herkenbaar als vangnet, suggesties gelogd,
  // run-samenvatting aanwezig. Tokens tellen mee in llm_usage (2 calls × 9 regels).
  const searches = await eventsByAction("search");
  const vangnetSearches = searches.filter(
    (e) => (e.payload as { bron?: string } | null)?.bron === "ai_vangnet",
  );
  expect(vangnetSearches).toHaveLength(9);
  expect(await eventsByAction("ai_suggestion_created")).toHaveLength(9);
  const runs = await eventsByAction("ai_vangnet_run");
  expect(runs).toHaveLength(1);
  expect((runs[0].payload as { checked: number }).checked).toBe(9);
  expect(await db.select().from(llmUsage)).toHaveLength(18); // 2 calls × 9 regels
}, 60_000);

// ── Stap 5 — review afronden ─────────────────────────────────────────────────
test("review: accepteer → groen + merkteken; variant kiezen; rood handmatig linken", async () => {
  // 5a. Een gele accepteren (voorstel-kandidaat, rank 1) → regel wordt GROEN
  // mét merkteken "manually chosen" (herontwerp stap 7); afwijking blijft staan.
  const lw102 = await lineByCode("Lw102");
  await decideReview(db, {
    specLineId: lw102.id,
    decision: "accepteer",
    actor: ACTOR,
  });
  const lw102Na = await lineByCode("Lw102");
  expect(lw102Na.status).toBe("groen");
  expect([nestWhiteId, nestBlackId]).toContain(lw102Na.matchedProductId);
  expect(lw102Na.chosenBy).toBe(ACTOR); // merkteken "manually chosen"
  expect((lw102Na.deviations ?? []).some((d) => d.verdict === "geel")).toBe(true);

  // 5b. Een variant kiezen (er zíjn echte kleurvarianten: NEST wit/zwart) →
  // expliciete keuze voor WIT → groen + merkteken.
  const lw103 = await lineByCode("Lw103");
  await decideReview(db, {
    specLineId: lw103.id,
    decision: "variant",
    productId: nestWhiteId,
    variantColor: "white",
    actor: ACTOR,
  });
  const lw103Na = await lineByCode("Lw103");
  expect(lw103Na.status).toBe("groen");
  expect(lw103Na.matchedProductId).toBe(nestWhiteId);
  expect(lw103Na.chosenBy).toBe(ACTOR);

  // 5c. Een rode handmatig linken (menshandeling, fase-veilig): Lp601 → SASSO.
  const lp601 = await lineByCode("Lp601");
  await linkManualProduct(db, {
    specLineId: lp601.id,
    productId: sassoId,
    actor: ACTOR,
  });
  const lp601Na = await lineByCode("Lp601");
  expect(lp601Na.status).toBe("groen");
  expect(lp601Na.matchedProductId).toBe(sassoId);
  expect(lp601Na.chosenBy).toBe(ACTOR);

  // 5c-bis. Lw101 is het nieuwe geval uit de Brink-demo: twee kandidaten die
  // állebei aan alles voldoen. Het systeem kiest daar niet — Brink wel, en dan is
  // het groen mét merkteken.
  const lw101 = await lineByCode("Lw101");
  await decideReview(db, {
    specLineId: lw101.id,
    decision: "accepteer",
    actor: ACTOR,
  });
  const lw101Na = await lineByCode("Lw101");
  expect(lw101Na.status).toBe("groen");
  expect(lw101Na.matchedProductId).not.toBeNull();
  expect(lw101Na.chosenBy).toBe(ACTOR);

  // 5d. De rest blijft bewust staan: Lr701 rood (p.m. back to customer), Lp801/Ls802
  // blauw (merkrij zonder producten → inlaadwachtrij, O5 — onze actie, niet die van
  // de klant); paars onveranderd. De review-wachtrij is leeg.
  expect((await lineByCode("Lr701")).status).toBe("rood");
  const queue = await getReviewQueue(db, dossierId);
  expect(queue.pending).toHaveLength(0);
  expect(queue.done).toHaveLength(3);

  expect(await eventsByAction("review_decided")).toHaveLength(3);
  expect(await eventsByAction("manual_link")).toHaveLength(1);

  // Eindverdeling na review: 8 groen · 4 open (gat A, onaangeroerd in de review —
  // ze staan niet in de wachtrij: open zet geen reviewKind) · 3 geel (auto-door) ·
  // 1 rood · 2 blauw · 2 paars. Zelfde eindstand als vóór 12 aug 2026 — maar vier
  // van die acht groene regels heeft het systeem zélf vastgezet in plaats van een mens.
  const rows = await getSpecLines(db, dossierId);
  const tally = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  expect(tally).toEqual({ groen: 8, open: 4, geel: 3, rood: 1, blauw: 2, paars: 2 });
}, 60_000);

// ── Stap 6 — estimate: offertenummer, totalen, PDF terugleesbaar ─────────────
// Tellende regels (aantal = 1 per regel, uit de inhoudsopgave):
//   groen, door het systeem vastgezet (goal-groen-betekent-zeker): Lp301 (SASSO 300)
//     + Ld201 (Holon 250) + Lp501 (STAR MAXI 160) + Ld105 (UNICO 120) = 830
//   groen, door Brink gekozen: Lw101 + Lw102 + Lw103 (NEST 180 elk) + Lp601 (SASSO 300) = 840
//   geel (auto-door): Ld202 (Holon 250) + Ld106 (UNICO 120) + Ld107 (UNICO 120) = 490
//   samen 2.160. Tot 12 aug 2026 was dit 660/490/1.150: de vier systeem-groene regels
//   hadden géén gekozen product en vielen uit de offerte — punt 3 uit de Brink-demo.
//   De 4 open regels tellen nog steeds niet mee (nooit gematcht → p.m.).
test("estimate: offertenummer, totalen 830+840/490/2.160, p.m.-posten en merktekens in de PDF", async () => {
  const year = new Date().getFullYear();
  const quote = await generateQuote(db, ALLE_DOSSIERS, dossierId, ACTOR);
  expect(quote.quoteNumber).toBe(`BL-${year}-0001`);

  const quoteData = await getQuote(db, dossierId);
  expect(quoteData?.lines).toHaveLength(11); // alleen groen/geel mét prijs
  expect(quoteData?.total).toBe(2160);

  const data = (await getEstimateData(db, ALLE_DOSSIERS, dossierId))!;
  expect(data.lines).toHaveLength(20); // álle regels — niets stilzwijgend weg
  expect(data.computed.totals).toEqual({ groen: 1670, geel: 490, samen: 2160 });
  // p.m.-verdeling sinds O5: de twee productloze merken zijn blauw (inladen — onze
  // actie), niet rood. Sinds A4 tellen de 4 open regels (gat A, nooit gematcht) hier
  // óók mee: ze kregen wél "p.m." in de regeltotaalkolom van de PDF en stonden in geen
  // enkel getal — 5 verantwoorde posten bij 9 niet-tellende regels.
  expect(data.computed.pm).toEqual({ blauw: 2, rood: 1, paars: 2, open: 4, total: 9 });
  expect(data.computed.openLines).toHaveLength(4);
  // De verantwoording dekt exact de regels die buiten het totaal vallen: 20 regels,
  // 11 tellend (8 groen + 3 geel), 9 p.m.
  expect(data.computed.pmLines).toHaveLength(9);
  // merktekens op de estimate-data (scherm en PDF gebruiken dezelfde bron)
  const flag = (code: string) => data.lines.find((l) => l.fixtureCode === code)!;
  expect(flag("Ld202").autoAccepted).toBe(true);
  expect(flag("Lw102").manuallyChosen).toBe(true);
  expect(flag("Lp601").manuallyChosen).toBe(true);

  const bytes = await renderEstimatePdf(data);
  expect(bytes.length).toBeGreaterThan(1000);
  const text = await pdfText(bytes);

  // kopblok + offertenummer
  expect(text).toContain(`BL-${year}-0001`);
  expect(text).toContain("Nieuwbouw Kantoorpand De Boog");
  expect(text).toContain("Deerns Nederland B.V.");

  // totalen per kleur + eindtotaal
  expect(text).toContain("1.670,00"); // groen
  expect(text).toContain("490,00"); // geel
  expect(text).toContain("2.160,00"); // samen
  expect(text).toContain("Combined (green + yellow)");

  // p.m.-posten: getoond, nooit opgeteld — en élke niet-tellende status staat erbij,
  // inclusief de vier open regels (A4).
  expect(text).toContain("blue 2 · red 1 · purple 2 · open 4");
  // …met voor elke open regel een eigen punt onder "Open items & actions", in plaats
  // van een kale "p.m." in de kolom die nergens wordt uitgelegd.
  expect(text.match(/not matched yet/g) ?? []).toHaveLength(4);
  const flat = text.replace(/\s+/g, " ");
  expect(flat).toContain("blue, red, purple and open are shown as p.m.");
  // blauw = inladen, onze actie (O5): beide merken staan als "load brand … (us)"
  expect(text).toContain("load brand Zumtobel (us)");
  expect(text).toContain("load brand Trilux (us)");
  expect(text).toContain("back to customer");
  expect(text).toContain("outside assortment");

  // afwijkingsnotitie (C-07) + beide merktekens
  expect(text).toContain("requested 40, delivered 32"); // Ld202: watt-afwijking
  expect(text).toContain("automatically accepted near-match"); // B3
  expect(text).toContain("manually chosen"); // review-keuze / handmatige link
}, 120_000);

// ── Stap 7 — statusflow ──────────────────────────────────────────────────────
test("statusflow: estimate_gestuurd bevriest de quote; gegund → phase awarded", async () => {
  await setStatus(db, ALLE_DOSSIERS, dossierId, "estimate_gestuurd", ACTOR);
  let dossier = (await getDossier(db, ALLE_DOSSIERS, dossierId))!;
  expect(dossier.status).toBe("estimate_gestuurd");
  expect(dossier.phase).toBe("tender"); // gestuurd ≠ gegund: suggesties blijven uit

  const frozen = await getQuote(db, dossierId);
  expect(frozen?.quote.frozenAt).not.toBeNull(); // I-06: kopblok + aantallen op slot
  expect(await eventsByAction("quote_frozen")).toHaveLength(1);

  await setStatus(db, ALLE_DOSSIERS, dossierId, "gegund", ACTOR);
  dossier = (await getDossier(db, ALLE_DOSSIERS, dossierId))!;
  expect(dossier.status).toBe("gegund");
  expect(dossier.phase).toBe("awarded"); // afgeleid door derivePhase (B6, één schrijver)

  const wissels = await eventsByAction("status_changed");
  expect(wissels).toHaveLength(2);
  const gegund = wissels.find(
    (e) => (e.payload as { to?: string } | null)?.to === "gegund",
  )!;
  expect(
    (gegund.payload as { phase_changed?: { from: string; to: string } }).phase_changed,
  ).toEqual({ from: "tender", to: "awarded" });
}, 30_000);

// ── Stap 8 — de audittrail over de hele keten (ijzeren regel 5) ──────────────
test("events-audittrail: import, matches, auto-door, ai, review, generatie, statuswissels", async () => {
  const all = await db.select().from(events);
  const count = (action: string) => all.filter((e) => e.action === action).length;

  expect(count("dossier_created")).toBe(1);
  expect(count("import_run_created")).toBe(1); // import
  expect(count("matched_status")).toBe(20); // matcher over élke regel
  expect(count("product_considered")).toBeGreaterThanOrEqual(17); // kandidaten-goud (K-02)
  expect(count("near_match_auto_accepted")).toBe(3); // B3 auto-door (geel)
  expect(count("certain_match_auto_accepted")).toBe(4); // zeker groen, zelf vastgezet
  expect(count("brand_load_requested")).toBe(2); // blauw is terug (O5): Zumtobel + Trilux
  expect(count("ai_vangnet_skipped_no_key")).toBe(1); // import zonder key: skip, geen fout
  expect(count("ai_suggestion_created")).toBe(9); // AI-suggesties (mock-run, incl. 4 open)
  expect(count("ai_vangnet_run")).toBe(1);
  expect(count("review_decided")).toBe(3); // 2× accepteer + variant
  expect(count("manual_link")).toBe(1); // rood handmatig gelinkt
  expect(count("quote_generated")).toBe(1); // offertegeneratie
  // NB: `estimate_pdf_generated` wordt in de downloadroute gelogd
  // (app/projects/[id]/quote/pdf/route.ts) — buiten deze repo-laag-test.
  expect(count("quote_frozen")).toBe(1);
  expect(count("status_changed")).toBe(2); // gestuurd + gegund

  // Elke vangnet-suggestie draagt de vangnet-herkomst in de zoek-events.
  const vangnetSearch = all.filter(
    (e) =>
      e.action === "search" &&
      (e.payload as { bron?: string } | null)?.bron === "ai_vangnet",
  );
  expect(vangnetSearch).toHaveLength(9); // 9 gecheckte restregels (blauw doet niet mee)
}, 30_000);
