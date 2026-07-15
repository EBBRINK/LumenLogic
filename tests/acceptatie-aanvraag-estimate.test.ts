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
//   groen  9× — Lp301, Lp302, Ls001, Lp401, Ld201, Lw101, Ls010, Lp501, Ld105
//   geel   5× — waarvan:
//     • 3× AUTO-DOOR (B3: precies één schoon-gele kandidaat, geen keuzeveld):
//       Ld202 (watt 40→32 = 20%), Ld106 (30→24 = 20%), Ld107 (28→24 = 14%)
//       → chosenBy 'system:auto' + event near_match_auto_accepted
//     • 2× IN REVIEW (twee schoon-gele kandidaten → ambigu, geen auto-door):
//       Lw102 (watt 8→10 = 25%), Lw103 (9→10 = 11%) — twee NEST-kleurvarianten
//   rood   2× — Lp601, Lr701 (merk wél in catalogus, product niet)
//   blauw  2× — Lp801 (Zumtobel), Ls802 (Trilux) → inlaadwachtrij
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
  seedBrandProduct,
  type TestDb,
} from "@/db/test-db";
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

const ACTOR = "hello@noplasticfloralfoam.com";

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
  // Zumtobel, Trilux, Vitra en USM bewust NIET geseed: blauw (merk niet in de
  // catalogus) resp. paars (geen verlichting — merk doet er niet toe).
}, 120_000);

// ── Stap 1 — project aanmaken ────────────────────────────────────────────────
test("project aanmaken: status concept, xis_phase start, phase tender (default veilig)", async () => {
  const dossier = await createDossier(db, {
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
}, 120_000);

// ── Stap 3 — matcher-uitkomsten (verdeling zoals bovenaan gedocumenteerd) ────
test("matcher: 9 groen · 5 geel (3 auto-door + 2 review) · 2 rood · 2 blauw · 2 paars", async () => {
  const rows = await getSpecLines(db, dossierId);
  const byStatus = (s: string) =>
    rows.filter((r) => r.status === s).map((r) => r.fixtureCode).sort();

  expect(byStatus("groen")).toEqual(
    ["Lp301", "Lp302", "Ls001", "Lp401", "Ld201", "Lw101", "Ls010", "Lp501", "Ld105"].sort(),
  );
  expect(byStatus("geel")).toEqual(
    ["Ld202", "Lw102", "Ld106", "Lw103", "Ld107"].sort(),
  );
  expect(byStatus("rood")).toEqual(["Lp601", "Lr701"].sort());
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
  // GEEN auto-door; ze staan in de review-wachtrij.
  for (const code of ["Lw102", "Lw103"]) {
    const l = await lineByCode(code);
    expect(l.matchedProductId).toBeNull();
    expect(l.reviewKind).toBe("geel");
  }
  const queue = await getReviewQueue(db, dossierId);
  expect(queue.pending.map((p) => p.fixtureCode).sort()).toEqual(["Lw102", "Lw103"]);

  // Groene regels: status wél, match nog níét gezet (kiezen blijft menswerk;
  // alleen B3-auto-door zet een match).
  const lp301 = await lineByCode("Lp301");
  expect(lp301.matchedProductId).toBeNull();

  // Blauw → inlaadwachtrij (H-08) + events.
  const queueRows = await db.select().from(brandLoadQueue);
  expect(queueRows.map((r) => r.brandKey).sort()).toEqual(["trilux", "zumtobel"]);
  expect(await eventsByAction("brand_load_requested")).toHaveLength(2);

  // Elke regel is gematcht en gelogd (ijzeren regel 5).
  expect(await eventsByAction("matched_status")).toHaveLength(20);
}, 60_000);

// ── Stap 4 — AI-vangnet met gemockte client (suggesties, nooit beslissingen) ─
// De mock doet per regel één brede zoekactie (input {} — in tender vergrendelt de
// server de zoektocht toch op het gevraagde merk) en suggereert het eerste
// toolresultaat. Restregels = geel-in-review (Lw102, Lw103) + rood (Lp601, Lr701);
// auto-door-geel en groen/blauw/paars worden overgeslagen.
test("vangnet (mock): 4 restregels gecheckt, 4 suggesties, statussen onaangetast", async () => {
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
  expect(result.checked).toHaveLength(4); // Lw102, Lw103, Lp601, Lr701
  expect(result.suggested).toBe(4);
  expect(result.discarded).toBe(0);

  // Suggesties zijn opgeslagen, met model + rationale — en het zijn SUGGESTIES:
  // geen enkele regel is van status/match/review-flag veranderd.
  const suggestions = await db.select().from(aiSuggestions);
  expect(suggestions).toHaveLength(4);
  for (const s of suggestions) expect(s.model).toBe(VANGNET_MODEL);

  const after = await getSpecLines(db, dossierId);
  for (const l of after) {
    const prev = before.get(l.fixtureCode)!;
    expect(l.status).toBe(prev.status);
    expect(l.matchedProductId).toBe(prev.matched);
    expect(l.reviewKind).toBe(prev.reviewKind);
  }

  // Audit (regel 5): zoekacties herkenbaar als vangnet, suggesties gelogd,
  // run-samenvatting aanwezig. Tokens tellen mee in llm_usage (2 calls × 4 regels).
  const searches = await eventsByAction("search");
  const vangnetSearches = searches.filter(
    (e) => (e.payload as { bron?: string } | null)?.bron === "ai_vangnet",
  );
  expect(vangnetSearches).toHaveLength(4);
  expect(await eventsByAction("ai_suggestion_created")).toHaveLength(4);
  const runs = await eventsByAction("ai_vangnet_run");
  expect(runs).toHaveLength(1);
  expect((runs[0].payload as { checked: number }).checked).toBe(4);
  expect(await db.select().from(llmUsage)).toHaveLength(8);
}, 60_000);

// ── Stap 5 — review afronden ─────────────────────────────────────────────────
test("review: accepteer → groen + merkteken; variant kiezen; rood handmatig linken", async () => {
  // 5a. Een gele accepteren (voorstel-kandidaat, rank 1) → regel wordt GROEN
  // mét merkteken "handmatig gekozen" (herontwerp stap 7); afwijking blijft staan.
  const lw102 = await lineByCode("Lw102");
  await decideReview(db, {
    specLineId: lw102.id,
    decision: "accepteer",
    actor: ACTOR,
  });
  const lw102Na = await lineByCode("Lw102");
  expect(lw102Na.status).toBe("groen");
  expect([nestWhiteId, nestBlackId]).toContain(lw102Na.matchedProductId);
  expect(lw102Na.chosenBy).toBe(ACTOR); // merkteken "handmatig gekozen"
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

  // 5d. De rest blijft bewust staan: Lr701 rood (p.m. back to customer),
  // blauw/paars onveranderd. De review-wachtrij is leeg.
  expect((await lineByCode("Lr701")).status).toBe("rood");
  const queue = await getReviewQueue(db, dossierId);
  expect(queue.pending).toHaveLength(0);
  expect(queue.done).toHaveLength(2);

  expect(await eventsByAction("review_decided")).toHaveLength(2);
  expect(await eventsByAction("manual_link")).toHaveLength(1);

  // Eindverdeling na review: 12 groen · 3 geel (auto-door) · 1 rood · 2 blauw · 2 paars.
  const rows = await getSpecLines(db, dossierId);
  const tally = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  expect(tally).toEqual({ groen: 12, geel: 3, rood: 1, blauw: 2, paars: 2 });
}, 60_000);

// ── Stap 6 — estimate: offertenummer, totalen, PDF terugleesbaar ─────────────
// Tellende regels (aantal = 1 per regel, uit de inhoudsopgave):
//   groen: Lw102 (NEST 180) + Lw103 (NEST 180) + Lp601 (SASSO 300) = 660
//   geel (auto-door): Ld202 (Holon 250) + Ld106 (UNICO 120) + Ld107 (UNICO 120) = 490
//   samen 1.150 — de 9 groene regels zónder gekozen match tellen bewust niet mee
//   (geen matchedProductId → geen prijs; kiezen blijft menswerk).
test("estimate: offertenummer, totalen 660/490/1.150, p.m.-posten en merktekens in de PDF", async () => {
  const year = new Date().getFullYear();
  const quote = await generateQuote(db, dossierId, ACTOR);
  expect(quote.quoteNumber).toBe(`BL-${year}-0001`);

  const quoteData = await getQuote(db, dossierId);
  expect(quoteData?.lines).toHaveLength(6); // alleen groen/geel mét prijs
  expect(quoteData?.total).toBe(1150);

  const data = (await getEstimateData(db, dossierId))!;
  expect(data.lines).toHaveLength(20); // álle regels — niets stilzwijgend weg
  expect(data.computed.totals).toEqual({ groen: 660, geel: 490, samen: 1150 });
  expect(data.computed.pm).toEqual({ blauw: 2, rood: 1, paars: 2, total: 5 });
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
  expect(text).toContain("660,00"); // groen
  expect(text).toContain("490,00"); // geel
  expect(text).toContain("1.150,00"); // samen
  expect(text).toContain("Combined (green + yellow)");

  // p.m.-posten: getoond, nooit opgeteld
  expect(text).toContain("blauw 2 · rood 1 · paars 2");
  expect(text).toContain("load brand Zumtobel (us)");
  expect(text).toContain("load brand Trilux (us)");
  expect(text).toContain("back to customer");
  expect(text).toContain("outside assortment");

  // afwijkingsnotitie (C-07) + beide merktekens
  expect(text).toContain("gevraagd 40, geleverd 32"); // Ld202: watt-afwijking
  expect(text).toContain("automatisch geaccepteerde bijna-match"); // B3
  expect(text).toContain("handmatig gekozen"); // review-keuze / handmatige link
}, 120_000);

// ── Stap 7 — statusflow ──────────────────────────────────────────────────────
test("statusflow: estimate_gestuurd bevriest de quote; gegund → phase awarded", async () => {
  await setStatus(db, dossierId, "estimate_gestuurd", ACTOR);
  let dossier = (await getDossier(db, dossierId))!;
  expect(dossier.status).toBe("estimate_gestuurd");
  expect(dossier.phase).toBe("tender"); // gestuurd ≠ gegund: suggesties blijven uit

  const frozen = await getQuote(db, dossierId);
  expect(frozen?.quote.frozenAt).not.toBeNull(); // I-06: kopblok + aantallen op slot
  expect(await eventsByAction("quote_frozen")).toHaveLength(1);

  await setStatus(db, dossierId, "gegund", ACTOR);
  dossier = (await getDossier(db, dossierId))!;
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
  expect(count("near_match_auto_accepted")).toBe(3); // B3 auto-door
  expect(count("brand_load_requested")).toBe(2); // blauw → inlaadwachtrij
  expect(count("ai_vangnet_skipped_no_key")).toBe(1); // import zonder key: skip, geen fout
  expect(count("ai_suggestion_created")).toBe(4); // AI-suggesties (mock-run)
  expect(count("ai_vangnet_run")).toBe(1);
  expect(count("review_decided")).toBe(2); // accepteer + variant
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
  expect(vangnetSearch).toHaveLength(4);
}, 30_000);
