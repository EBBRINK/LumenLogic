// Repo-laag van de AI-tekstleesroute (fase B) met PGlite + gemockte tekst-client:
// happy path over twee batches (regels mét verplichte review, herkomst en
// vertrouwenssignaal; rijkste-wint-dedup over batches heen; markdown-controlespoor),
// budget-op halverwege (eerlijke stop + skip-event, gelezen regels blijven), en
// zonder key (nette stop, nooit stil). Conventies volgen lib/repo/ocr.test.ts.
import { expect, test } from "vitest";
import { asc, eq } from "drizzle-orm";
import { events, llmUsage, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  MAX_TOKENS_PER_BATCH,
} from "@/lib/ai/leesroute";
import type {
  OcrClient,
  OcrMessageParams,
  OcrResponse,
} from "@/lib/ai/ocr";
import { createDossier } from "@/lib/repo/dossiers";
import { recordLeesrouteImport } from "@/lib/repo/leesroute";

const ACTOR = "eduard@brinklicht.nl";
const USAGE = { input_tokens: 2000, output_tokens: 300 }; // → €0,0035 per batch
const BATCH_COST = 0.0035;
const MARKDOWN = "## Page 1\n\nLp301 Raadzaal XAL SASSO 100";

function mockClient(responses: Array<OcrResponse | Error>) {
  const calls: OcrMessageParams[] = [];
  const client: OcrClient = {
    async createMessage(params) {
      calls.push(JSON.parse(JSON.stringify(params)) as OcrMessageParams);
      const next = responses.shift();
      if (!next) throw new Error("mock-client: geen respons meer in het script");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, calls };
}

function toolResponse(regels: unknown, usage = USAGE): OcrResponse {
  return {
    content: [
      { type: "tool_use", id: "tu_1", name: "lever_regels", input: { regels } },
    ],
    stop_reason: "tool_use",
    usage,
  };
}

async function seedWorld(db: TestDb) {
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, { name: "Raadhuis tekstboek" });
  return dossier.id;
}

async function eventsByAction(db: TestDb, action: string) {
  return db.select().from(events).where(eq(events.action, action));
}

async function runLines(db: TestDb, runId: string) {
  return db
    .select()
    .from(specLines)
    .where(eq(specLines.importRunId, runId))
    .orderBy(asc(specLines.sortOrder));
}

// ── Happy path: 2 batches, lege pagina overgeslagen, dedup over batches heen ─
test("happy path 2 batches: regels mét review/herkomst, rijkste-wint over batches, rawMarkdown behouden", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const brandNames = ["XAL"];

  // 10 pagina's, pagina 3 leeg → 9 leesbare → batch 1 = pagina 1,2,4..9 (8),
  // batch 2 = pagina 10. Batch 2 leest Lp301 opnieuw, maar RIJKER (specs) →
  // de dedup over batches heen moet de bestaande regel upgraden, niet dubbelen.
  const pages = Array.from({ length: 10 }, (_, i) =>
    i === 2 ? "   " : `tekst van pagina ${i + 1}`,
  );
  const { client, calls } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp301 Raadzaal XAL SASSO 100",
        pagina: 1,
      },
      {
        armatuurcode: "L004",
        merk: null,
        type: "ronde pendelreeks",
        ruwe_tekst: "boven de balie een ronde pendelreeks, aangeduid als L004",
        pagina: 2,
      },
    ]),
    toolResponse([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst:
          "Lp301 Armatuur details: XAL SASSO 100. Lichtbron: Vermogen: 17,9 W. " +
          "Kleurtemperatuur: 3000 K. CRI ≥ 90.",
        pagina: 10,
      },
    ]),
  ]);

  const result = await recordLeesrouteImport(db, {
    dossierId,
    filename: "raadhuis.pdf",
    pages,
    markdown: MARKDOWN,
    brandNames,
    routerBesluit: { reden: "merkdekking", bekendeMerken: 14, totaal: 31 },
    client,
    actor: ACTOR,
  });

  // Run: zoals recordPdfImport (source 'pdf', direct bevestigd, markdown als
  // controlespoor), pageCount over ÁLLE pagina's (ook de lege — het boek is 10).
  expect(result.run.source).toBe("pdf");
  expect(result.run.status).toBe("bevestigd");
  expect(result.run.ocrStatus).toBeNull();
  expect(result.run.rawMarkdown).toBe(MARKDOWN);
  expect(result.run.counts).toMatchObject({ total: 3, checked: 2, pageCount: 10 });
  expect(result).toMatchObject({
    created: 2,
    duplicates: 0,
    upgraded: 1,
    batches: 2,
    truncated: 0,
    gestopt: null,
  });
  expect(result.costEur).toBeCloseTo(2 * BATCH_COST, 6);

  // Twee calls: batch 1 met precies de 8 niet-lege pagina's 1,2,4..9 (pagina 3
  // is deterministisch overgeslagen), batch 2 met alleen pagina 10.
  expect(calls.length).toBe(2);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_BATCH);
  const [blok1] = calls[0].messages[0].content;
  const [blok2] = calls[1].messages[0].content;
  if (blok1.type !== "text" || blok2.type !== "text")
    throw new Error("verwachtte tekstblokken");
  expect(blok1.text).toContain("=== PAGE 1 ===");
  expect(blok1.text).toContain("=== PAGE 9 ===");
  expect(blok1.text).not.toContain("=== PAGE 3 ===");
  expect(blok1.text).not.toContain("=== PAGE 10 ===");
  expect(blok2.text).toContain("=== PAGE 10 ===");

  // Regels: verplichte review (B7), vertrouwen via codeValid, herkomst uit het
  // pagina-veld, importRunId gezet. Lp301 draagt na de upgrade de rijkere specs
  // + pagina 10 (rijkste-wint over batches heen, zelfde id).
  const lines = await runLines(db, result.run.id);
  expect(lines.map((l) => l.fixtureCode)).toEqual(["Lp301", "L004"]);
  const [lp, l004] = lines;
  expect(lp.source).toBe("ocr");
  expect(lp.sourceConfidence).toBe("middel"); // codeValid → constant 'middel'
  expect(lp.sourcePage).toBe(10);
  expect(lp.importRunId).toBe(result.run.id);
  expect(lp.reviewKind).toBe("ocr");
  expect(lp.reqWatt).toBe("17.90");
  expect(lp.reqKelvin).toBe(3000);
  expect(l004.sourceConfidence).toBe("laag"); // L004 matcht de CODE-regex niet
  expect(l004.sourcePage).toBe(2);
  expect(l004.reviewKind).toBe("ocr");
  expect(l004.brandText).toBeNull(); // geen merk gelezen én geen bekend merk in de rest

  const upgradedEvents = await eventsByAction(db, "ocr_line_upgraded");
  expect(upgradedEvents.length).toBe(1);
  expect(upgradedEvents[0].payload).toMatchObject({
    fixtureCode: "Lp301",
    oldPage: 1,
    newPage: 10,
  });

  // Kosten: één llm_usage-rij per batch, purpose 'leesroute', gekoppeld aan de run.
  const usage = await db
    .select()
    .from(llmUsage)
    .where(eq(llmUsage.importRunId, result.run.id));
  expect(usage.length).toBe(2);
  for (const u of usage) expect(u.purpose).toBe("leesroute");

  // Audit: import_run_created draagt route + routerbesluit (regel 5).
  const created = await eventsByAction(db, "import_run_created");
  expect(created.length).toBe(1);
  expect(created[0].payload).toMatchObject({
    runId: result.run.id,
    source: "pdf",
    route: "leesroute",
    reden: "merkdekking",
    bekendeMerken: 14,
    totaal: 31,
  });

  // B8: GEEN vangnet-trigger — elke leesroute-regel heeft een open review en de
  // vangnet-gating sluit die uit; de trigger hoort bij de review-beslissing.
  for (const a of [
    "ai_vangnet_done",
    "ai_vangnet_failed",
    "ai_vangnet_skipped_no_key",
    "ai_vangnet_run",
  ]) {
    expect((await eventsByAction(db, a)).length).toBe(0);
  }
  expect((await eventsByAction(db, "leesroute_skipped_no_key")).length).toBe(0);
  expect((await eventsByAction(db, "leesroute_skipped_budget")).length).toBe(0);
});

// ── Budget op halverwege: eerlijke stop, gelezen regels blijven staan ────────
test("budget op ná batch 1 → gestopt budget_run + skip-event; batch 1-regels blijven", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);

  // 9 niet-lege pagina's → 2 batches. Batch 1 kost €1,001 (output 200k tokens)
  // en vult daarmee het gedeelde €1-plafond; de budgetcheck van batch 2 weigert.
  const pages = Array.from({ length: 9 }, (_, i) => `tekst van pagina ${i + 1}`);
  const { client, calls } = mockClient([
    toolResponse(
      [
        {
          armatuurcode: "Lp301",
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: "Lp301 XAL SASSO 100",
          pagina: 1,
        },
      ],
      { input_tokens: 1000, output_tokens: 200_000 },
    ),
  ]);

  const result = await recordLeesrouteImport(db, {
    dossierId,
    filename: "raadhuis.pdf",
    pages,
    markdown: MARKDOWN,
    brandNames: ["XAL"],
    routerBesluit: { reden: "merkdekking", bekendeMerken: 1, totaal: 9 },
    client,
    actor: ACTOR,
  });

  expect(result.gestopt).toBe("budget_run");
  expect(result).toMatchObject({ created: 1, batches: 1 });
  expect(calls.length).toBe(1); // batch 2 is nooit een call geworden

  // Wat al gelezen is blijft staan.
  const lines = await runLines(db, result.run.id);
  expect(lines.map((l) => l.fixtureCode)).toEqual(["Lp301"]);
  expect(result.run.counts).toMatchObject({ total: 1, checked: 1 });

  // Skip-event op de run (regel 5, nooit stil).
  const skipped = await eventsByAction(db, "leesroute_skipped_budget");
  expect(skipped.length).toBe(1);
  expect(skipped[0].entityId).toBe(result.run.id);
  expect(skipped[0].payload).toEqual({ reden: "budget_run" });
});

// ── Zonder key: nette stop vóór de eerste call, run + controlespoor bestaan ──
test("geen key en geen client → gestopt no_key + skip-event; run met markdown blijft", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);

  const result = await recordLeesrouteImport(db, {
    dossierId,
    filename: "raadhuis.pdf",
    pages: ["tekst van pagina 1"],
    markdown: MARKDOWN,
    brandNames: ["XAL"],
    routerBesluit: { reden: "geen_regels", bekendeMerken: 0, totaal: 0 },
    actor: ACTOR,
  });

  expect(result.gestopt).toBe("no_key");
  expect(result).toMatchObject({ created: 0, batches: 0, costEur: 0 });
  // De run bestaat mét het markdown-controlespoor — de import verdwijnt nooit stil.
  expect(result.run.rawMarkdown).toBe(MARKDOWN);
  expect((await runLines(db, result.run.id)).length).toBe(0);
  const skipped = await eventsByAction(db, "leesroute_skipped_no_key");
  expect(skipped.length).toBe(1);
  expect(skipped[0].payload).toEqual({ reden: "no_key" });
});

// ── Gat B (20 jul): deterministische segment-verrijking ──────────────────────
// Het model kapt ruwe_tekst soms af vóór de spec-sectie (live: de vier
// XAL-regels van dossier ae0eead9 verloren zo al hun specs). De repo-laag
// snijdt daarom per regel het échte rijsegment uit de server-side paginatekst
// (model-codes als ankers, lib/pdf/rijsegmenten.ts) en geeft dat als extra
// parse-input mee — deterministisch, geen verzin-risico.
test("gat B: afgekapte ruwe_tekst + volledige paginatekst → req_*-velden gevuld + audit-event", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);

  const paginaTekst =
    "Lr301 Raadzaal Inbouw Downlight XAL SASSO PRO 100 112x106mm (ØxH) " +
    "IP20 / - LED 2810 lm 104 lm/W 27 W Middelbreed stralend (39°) " +
    "3000K CRI ≥ 90 DALI-2 Dimbaar";
  const { client } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lr301",
        merk: "XAL",
        type: "SASSO PRO 100",
        // Exact het live-gedrag: afgekapt vóór de spec-sectie.
        ruwe_tekst:
          "Lr301 Raadzaal Inbouw Downlight XAL SASSO PRO 100 112x106mm (ØxH)",
        pagina: 1,
      },
    ]),
  ]);

  const result = await recordLeesrouteImport(db, {
    dossierId,
    filename: "raadhuis.pdf",
    pages: [paginaTekst],
    markdown: `## Page 1\n\n${paginaTekst}`,
    brandNames: ["XAL"],
    routerBesluit: { reden: "merkdekking", bekendeMerken: 0, totaal: 1 },
    client,
    actor: ACTOR,
  });
  expect(result.created).toBe(1);

  const [line] = await runLines(db, result.run.id);
  // De specs komen uit het rijsegment — de afgekapte ruwe_tekst had ze niet.
  expect(line.reqKelvin).toBe(3000);
  expect(line.reqCri).toBe(90);
  expect(line.reqIp).toBe("IP20");
  expect(Number(line.reqWatt)).toBe(27);
  expect(line.reqLumen).toBe(2810);
  expect(Number(line.reqBeamAngle)).toBe(39);
  expect(line.reqDimmable).toBe("DALI");
  // En dus toetst de matcher échte eisen: de deviations zijn niet leeg (het
  // gesede product draagt alleen kelvin, dus de regel is eerlijk 'open' door
  // onvolledige prodúctdata — wezenlijk anders dan het vacuous-open van gat A,
  // dat géén enkele toetsing had).
  expect((line.deviations ?? []).length).toBeGreaterThan(0);
  expect(
    (line.deviations ?? []).some((d) => d.field === "kelvin" && d.verdict === "groen"),
  ).toBe(true);

  // Audit (regel 5): één run-event met de tellers.
  const verrijktEvents = await eventsByAction(db, "leesroute_segmenten_verrijkt");
  expect(verrijktEvents).toHaveLength(1);
  expect(verrijktEvents[0].payload).toMatchObject({
    regelsMetSegment: 1,
    regelsVerrijkt: 1,
  });
});

test("gat B: paginatekst zonder de code (of vision-achtig pad zonder segment) → gedrag ongewijzigd, geen event", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const { client } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lr999",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lr999 XAL SASSO 100",
        pagina: 1,
      },
    ]),
  ]);
  const result = await recordLeesrouteImport(db, {
    dossierId,
    filename: "boek.pdf",
    // De pagina noemt de code nérgens — het anker vindt niets.
    pages: ["Alleen proza over verlichting, zonder codes."],
    markdown: "## Page 1\n\nAlleen proza.",
    brandNames: ["XAL"],
    routerBesluit: { reden: "geen_regels", bekendeMerken: 0, totaal: 0 },
    client,
    actor: ACTOR,
  });
  expect(result.created).toBe(1);
  const [line] = await runLines(db, result.run.id);
  expect(line.reqKelvin).toBeNull(); // niets bijgevuld — en niets verzonnen
  expect(await eventsByAction(db, "leesroute_segmenten_verrijkt")).toHaveLength(0);
});
