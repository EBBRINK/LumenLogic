// Repo-laag van de AI-tekstleesroute (fase B) met PGlite + gemockte tekst-client:
// happy path over twee batches (regels mét verplichte review, herkomst en
// vertrouwenssignaal; rijkste-wint-dedup over batches heen; markdown-controlespoor),
// budget-op halverwege (eerlijke stop + skip-event, gelezen regels blijven), en
// zonder key (nette stop, nooit stil). Conventies volgen lib/repo/ocr.test.ts.
import { expect, test } from "vitest";
import { asc, eq } from "drizzle-orm";
import { events, importRuns, llmUsage, specLines } from "@/db/schema";
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
  const dossier = await createDossier(db, { orgId: null, name: "Raadhuis tekstboek" });
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
  // A6: de lus liep uit → eindstand 'klaar' (niet 'bezig', dus niet afgebroken).
  expect(result.run.ocrStatus).toBe("klaar");
  expect(result.hervat).toBe(false);
  expect(result.run.rawMarkdown).toBe(MARKDOWN);
  expect(result.run.counts).toMatchObject({
    total: 3,
    checked: 2,
    pageCount: 10,
    pagesDone: 10,
  });
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
  // A6: budget is terminaal — 'gestopt', niet 'bezig' (hervatten heeft geen zin,
  // de volgende poging loopt tegen hetzelfde plafond).
  expect(result.run.ocrStatus).toBe("gestopt");

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
  // A6: zonder key blijft de run op 'bezig' — key terug = gewoon verder lezen
  // (exact het OCR-gedrag), dus dit is géén terminale stand.
  expect(result.run.ocrStatus).toBe("bezig");
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

// ── A6 (reviewzwerm 2.5a): afgekapte run herkenbaar én hervatbaar ────────────
// De batchlus draait serieel binnen één server action; bij een boek van tientallen
// pagina's kapt het platform de functie af terwijl import_runs en een deel van de
// spec-regels al weggeschreven zijn. Deze twee tests pinnen het vangnet:
//   (1) MIDDEN in de lus draagt de run-rij al een stand ('bezig') én voortgang
//       (counts.pagesDone) — dus een kill op dat moment is herkenbaar afgebroken,
//       niet "mislukt" en niet "klaar";
//   (2) zo'n achtergebleven rij wordt door de volgende poging opgepakt: dezelfde
//       run, en het model krijgt alleen de nog ongelezen pagina's.
test("A6: midden in de lus staat de run op 'bezig' mét pagesDone — een kill is herkenbaar afgebroken", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);

  // 9 niet-lege pagina's → batch 1 = pagina 1..8, batch 2 = pagina 9.
  const pages = Array.from({ length: 9 }, (_, i) => `tekst van pagina ${i + 1}`);
  // De waarneming gebeurt van BINNENUIT: op de tweede modelcall (= batch 1 is
  // verwerkt en weggeschreven, batch 2 is nog niet klaar) lezen we de run-rij.
  let middenInDeLus: { ocrStatus: string | null; pagesDone: unknown } | null =
    null;
  let call = 0;
  const client: OcrClient = {
    async createMessage() {
      call++;
      if (call === 2) {
        const [row] = await db.select().from(importRuns);
        middenInDeLus = {
          ocrStatus: row.ocrStatus,
          pagesDone: (row.counts ?? {}).pagesDone,
        };
      }
      return toolResponse([
        {
          armatuurcode: `Lp30${call}`,
          merk: "XAL",
          type: "SASSO 100",
          ruwe_tekst: `Lp30${call} XAL SASSO 100`,
          pagina: call === 1 ? 1 : 9,
        },
      ]);
    },
  };

  await recordLeesrouteImport(db, {
    dossierId,
    filename: "raadhuis.pdf",
    pages,
    markdown: MARKDOWN,
    brandNames: ["XAL"],
    routerBesluit: { reden: "merkdekking", bekendeMerken: 1, totaal: 9 },
    client,
    actor: ACTOR,
  });

  // Dít is de kern: op dat moment zegt de rij "bezig" (niet klaar, niet gestopt)
  // én vertelt hij hoe ver hij was. Zonder beide is een afgekapte run niet van een
  // geslaagde te onderscheiden en kan een tweede poging niet verder.
  expect(middenInDeLus).not.toBeNull();
  expect(middenInDeLus!.ocrStatus).toBe("bezig");
  expect(middenInDeLus!.pagesDone).toBe(8);
});

test("A6: een afgebroken run ('bezig' + pagesDone) wordt hervat — zelfde run, alleen de resterende pagina's", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const pages = Array.from({ length: 9 }, (_, i) => `tekst van pagina ${i + 1}`);

  // De afgebroken toestand wordt door de CODE ZELF gemaakt, niet met de hand
  // gefabriceerd. De vorige versie van deze test zaaide `rows: []` mét
  // `pagesDone: 8` — een toestand die de lus nooit produceert (rows en pagesDone
  // gaan in ÉÉN update de database in), waardoor het dedup-pad ongetest bleef.
  // Hier leest een echte eerste aanroep batch 1 (pagina 1..8) en schrijft die zijn
  // snapshot weg; het enige dat we simuleren is het gevolg van de kill: de
  // eindstand-update aan het slot heeft nooit gedraaid, dus de rij staat op 'bezig'.
  const { client: eersteClient } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp301 XAL SASSO 100",
        pagina: 1,
      },
    ]),
  ]);
  const eerste = await recordLeesrouteImport(db, {
    dossierId,
    filename: "raadhuis.pdf",
    pages: pages.slice(0, 8),
    markdown: MARKDOWN,
    brandNames: ["XAL"],
    routerBesluit: { reden: "merkdekking", bekendeMerken: 1, totaal: 9 },
    client: eersteClient,
    actor: ACTOR,
  });
  expect(eerste.run.counts).toMatchObject({ pagesDone: 8 });
  expect(eerste.run.rows).toHaveLength(1);
  const afgekapt = eerste.run;
  await db
    .update(importRuns)
    .set({ ocrStatus: "bezig" })
    .where(eq(importRuns.id, afgekapt.id));

  const { client, calls } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lp309",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp309 XAL SASSO 100",
        pagina: 9,
      },
    ]),
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

  // Dezelfde run — geen tweede import_runs-rij, dus geen dubbele boekhouding.
  expect(result.hervat).toBe(true);
  expect(result.run.id).toBe(afgekapt.id);
  expect(await db.select().from(importRuns)).toHaveLength(1);

  // Eén call, en die bevat alléén pagina 9: de eerste acht worden niet opnieuw
  // gelezen (en dus niet opnieuw betaald).
  expect(calls.length).toBe(1);
  const [blok] = calls[0].messages[0].content;
  if (blok.type !== "text") throw new Error("verwachtte een tekstblok");
  expect(blok.text).toContain("=== PAGE 9 ===");
  expect(blok.text).not.toContain("=== PAGE 1 ===");

  // Afgerond → 'klaar', en de hervatting staat in het log (regel 5, nooit stil).
  expect(result.run.ocrStatus).toBe("klaar");
  expect(result.created).toBe(1);
  const hervat = await eventsByAction(db, "leesroute_resumed");
  expect(hervat).toHaveLength(1);
  expect(hervat[0].entityId).toBe(afgekapt.id);
  expect(hervat[0].actor).toBe(ACTOR);
  expect(hervat[0].payload).toMatchObject({ pagesDone: 8, pageCount: 9 });
  // Een hervatting is géén nieuwe run: import_run_created blijft bij de eerste.
  expect(await eventsByAction(db, "import_run_created")).toHaveLength(1);
});

// A6-HERSTEL: de kill valt niet netjes tússen twee batches maar MIDDEN in
// verwerkGelezenRegels — de spec-regels van deze batch staan al in de database, de
// run-snapshot (rows + pagesDone) nog niet: die gaat pas ná de hele batch in één
// update mee. De dedup leunde op `run.rows`; is die leeg, dan liep elke code recht
// het created-pad in (addSpecLines) en werd de bestaande eigen regel nooit
// opgezocht. Resultaat: twee spec-regels met dezelfde armatuurcode in dezelfde run —
// de duplicaten-bugklasse (A9) die deze sprint al vier keer opdook.
test("A6: hervatten na een kill MIDDEN in de batch (spec-regels er al, snapshot stale) dupliceert de regel niet", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const pages = ["tekst van pagina 1", "tekst van pagina 2", "tekst van pagina 3"];
  const regel = {
    armatuurcode: "Lp301",
    merk: "XAL",
    type: "SASSO 100",
    ruwe_tekst: "Lp301 XAL SASSO 100",
    pagina: 1,
  };

  // Eerste aanroep: de batch wordt echt gelezen en de spec-regel echt aangemaakt.
  const { client: eersteClient } = mockClient([toolResponse([regel])]);
  const eerste = await recordLeesrouteImport(db, {
    dossierId,
    filename: "boek.pdf",
    pages,
    markdown: MARKDOWN,
    brandNames: ["XAL"],
    routerBesluit: { reden: "merkdekking", bekendeMerken: 1, totaal: 3 },
    client: eersteClient,
    actor: ACTOR,
  });
  expect(await runLines(db, eerste.run.id)).toHaveLength(1);

  // De kill: de snapshot-update die rows én pagesDone wegschrijft heeft nooit
  // gedraaid. Dít is de echte crashvorm — regels in de database, boekhouding leeg.
  await db
    .update(importRuns)
    .set({
      rows: [],
      counts: { total: 0, checked: 0, pageCount: 3, pagesDone: 0 },
      ocrStatus: "bezig",
    })
    .where(eq(importRuns.id, eerste.run.id));

  // Hervatting: dezelfde pagina's worden opnieuw gelezen (dat kost geld — dat is de
  // prijs van het vangnet), en het model levert dezelfde code opnieuw.
  const { client } = mockClient([toolResponse([regel])]);
  const hervat = await recordLeesrouteImport(db, {
    dossierId,
    filename: "boek.pdf",
    pages,
    markdown: MARKDOWN,
    brandNames: ["XAL"],
    routerBesluit: { reden: "merkdekking", bekendeMerken: 1, totaal: 3 },
    client,
    actor: ACTOR,
  });

  expect(hervat.hervat).toBe(true);
  expect(hervat.run.id).toBe(eerste.run.id);
  // De kern: één spec-regel per armatuurcode in deze run, niet twee.
  const lines = await runLines(db, eerste.run.id);
  expect(lines).toHaveLength(1);
  expect(lines.filter((l) => l.fixtureCode === "Lp301")).toHaveLength(1);
  expect(hervat.created).toBe(0);
  expect(hervat.duplicates).toBe(1);
});

// A6-HERSTEL (tweede, kleinere fout): een gefaalde batch verhoogt pagesDone niet,
// maar een látere geslaagde batch zette pagesDone op zíjn eigen laatste pagina —
// bij hervatting werden de pagina's van de gefaalde batch dan stilzwijgend
// overgeslagen. Paginaverlies, geen duplicaat. pagesDone mag daarom alleen de
// AANEENGESLOTEN voortgang volgen: na een gat schuift hij niet meer op.
test("A6: een gefaalde batch bevriest pagesDone — een latere geslaagde batch slaat de gemiste pagina's niet stilzwijgend over", async () => {
  const db = await createTestDb();
  const dossierId = await seedWorld(db);
  const pages = Array.from({ length: 9 }, (_, i) => `tekst van pagina ${i + 1}`);

  // Batch 1 (pagina 1..8) faalt met een echte fout; batch 2 (pagina 9) slaagt.
  const { client } = mockClient([
    new Error("model onbereikbaar"),
    toolResponse([
      {
        armatuurcode: "Lp309",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp309 XAL SASSO 100",
        pagina: 9,
      },
    ]),
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

  // De fout is gelogd (regel 5) en de tweede batch is wél verwerkt.
  expect(await eventsByAction(db, "leesroute_batch_failed")).toHaveLength(1);
  expect(result.batches).toBe(1);
  expect(result.created).toBe(1);
  // Maar de voortgang staat op 0: pagina 1..8 zijn nooit gelezen, dus een
  // hervatting moet daar opnieuw beginnen in plaats van bij pagina 10.
  expect(result.run.counts).toMatchObject({ pagesDone: 0 });
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
