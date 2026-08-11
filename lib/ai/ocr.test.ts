// OCR-vision-laag (B3/B4, bouwstap 3) met een gemockte client en PGlite: parsing van
// de geforceerde tool-output (incl. codeValid tegen de parser-regex), lege/kapotte
// output zonder crash, het reserveringspatroon voor het €1-plafond per run, de
// maandbudget-skip, echte kosten in llm_usage ná de call, de events en de skip zonder
// key. De module schrijft NOOIT spec-regels — dat is bouwstap 4.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { events, importRuns, llmUsage, projectDossiers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import {
  checkOcrBudget,
  ocrPage,
  MAX_TOKENS_PER_PAGE,
  MAX_TOKENS_RETRY,
  OCR_MAX_EUR_PER_RUN,
  OCR_MODEL,
  OCR_RESERVE_EUR,
  isOcrPageSuccess,
  parseLeverRegels,
  readPageWithVision,
  type OcrBudgetCheck,
  type OcrClient,
  type OcrContentBlock,
  type OcrMessageParams,
  type OcrResponse,
} from "@/lib/ai/ocr";
import { setSetting } from "@/lib/repo/settings";

const ACTOR = "eduard@brinklicht.nl";
const USAGE = { input_tokens: 2000, output_tokens: 300 };
// (2000 × €1 + 300 × €5) / 1M = €0,0035
const USAGE_COST = "0.0035";
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

// ── Mock-client: script van responses; elke call wordt opgenomen ────────────
function mockClient(
  responses: Array<OcrResponse | Error>,
  onCall?: () => Promise<void>,
) {
  const calls: OcrMessageParams[] = [];
  const client: OcrClient = {
    async createMessage(params) {
      calls.push(JSON.parse(JSON.stringify(params)) as OcrMessageParams);
      if (onCall) await onCall();
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

// Afgekapte respons (O3-tripwire): bij max_tokens midden in een tool_use-blok
// levert de API het incomplete blok NIET mee → content is leeg, regels dus 0.
// Vaste usage zodat de kosten exact te asserten zijn.
const TRUNC_USAGE = { input_tokens: 1600, output_tokens: 4000 };
// (1600 × €1 + 4000 × €5) / 1M = €0,0216
function truncatedResponse(usage = TRUNC_USAGE): OcrResponse {
  return { content: [], stop_reason: "max_tokens", usage };
}

async function seedRun(db: TestDb) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "OCR", phase: "tender" })
    .returning();
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: dossier.id,
      source: "ocr",
      filename: "boek.pdf",
      rows: [],
      ocrStatus: "bezig",
    })
    .returning();
  return run;
}

async function usageRows(db: TestDb, importRunId: string) {
  return db
    .select()
    .from(llmUsage)
    .where(eq(llmUsage.importRunId, importRunId));
}

async function eventsByAction(db: TestDb, action: string) {
  return db.select().from(events).where(eq(events.action, action));
}

// ── Happy path ───────────────────────────────────────────────────────────────
test("happy path: 2 regels uit de tool-output, codeValid, echte kosten en event", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp301 XAL SASSO 100 3000K IP44",
      },
      { armatuurcode: "Ls004-a", merk: null, type: null, ruwe_tekst: "Ls004-a" },
    ]),
  ]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 7,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
    actor: ACTOR,
  });

  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels).toEqual([
    {
      armatuurcode: "Lp301",
      merk: "XAL",
      type: "SASSO 100",
      ruweTekst: "Lp301 XAL SASSO 100 3000K IP44",
      codeValid: true,
      aantal: null, // O6: geen aantal geleverd → null (nooit geraden)
      artikelnummer: null, // een armaturenboek heeft geen artikelnummerkolom
    },
    {
      armatuurcode: "Ls004-a",
      merk: null,
      type: null,
      ruweTekst: "Ls004-a",
      codeValid: true,
      aantal: null,
      artikelnummer: null,
    },
  ]);
  expect(result.inputTokens).toBe(USAGE.input_tokens);
  expect(result.outputTokens).toBe(USAGE.output_tokens);

  // Call-vorm: klein model, geforceerde tool, beeld als base64-blok (B3),
  // eerste call altijd met het paginabudget.
  expect(calls.length).toBe(1);
  expect(calls[0].model).toBe(OCR_MODEL);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_PAGE);
  expect(calls[0].tool_choice).toEqual({ type: "tool", name: "lever_regels" });
  const [img, txt] = calls[0].messages[0].content;
  expect(img).toMatchObject({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg" },
  });
  expect(txt).toMatchObject({ type: "text" });
  // De prompt/tools bevatten nooit prijzen of catalogus-context (regel 2).
  expect(JSON.stringify(calls[0]).toLowerCase()).not.toContain("prijs");
  expect(calls[0].tools.length).toBe(1);

  // llm_usage: precies één rij, purpose 'ocr', mét run-id en de ECHTE kosten
  // (de reservering is bijgewerkt, niet verdubbeld).
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].purpose).toBe("ocr");
  expect(rows[0].costEur).toBe(USAGE_COST);
  expect(rows[0].costEur).not.toBe(OCR_RESERVE_EUR.toFixed(4));

  // Regel 5: ocr_page_done met pagina, aantallen, tokens en kosten.
  const done = await eventsByAction(db, "ocr_page_done");
  expect(done.length).toBe(1);
  expect(done[0].entityId).toBe(run.id);
  expect(done[0].actor).toBe(ACTOR);
  expect(done[0].payload).toMatchObject({
    page: 7,
    regels: 2,
    codeInvalid: 0,
    tokens: { input: USAGE.input_tokens, output: USAGE.output_tokens },
    costEur: Number(USAGE_COST),
    truncated: 0,
  });
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
});

test("lege pagina: 0 regels zonder fout — een lege lijst is een goed antwoord", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([toolResponse([])]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });

  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels).toEqual([]);
  // Leeg + stop_reason "tool_use" is legitiem blanco: NOOIT een tweede betaalde
  // call, en geen truncated-event.
  expect(calls.length).toBe(1);
  expect((await eventsByAction(db, "ocr_page_truncated")).length).toBe(0);
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
  const done = await eventsByAction(db, "ocr_page_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ page: 1, regels: 0 });
});

// ── O3-tripwire: afkapping → precies één retry ──────────────────────────────
test("afkapping: retry met dubbel budget slaagt — regels compleet, kosten en events kloppen", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const volledig = [
    {
      armatuurcode: "Lp301",
      merk: "XAL",
      type: "SASSO 100",
      ruwe_tekst: "Lp301 XAL SASSO 100",
    },
    { armatuurcode: "Ls004", merk: null, type: null, ruwe_tekst: "Ls004" },
  ];
  const { client, calls } = mockClient([
    truncatedResponse(),
    toolResponse(volledig),
  ]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 4,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
    actor: ACTOR,
  });

  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");
  // Regels van de beste (tweede) poging, tokens als som over beide calls.
  expect(result.regels.map((r) => r.armatuurcode)).toEqual(["Lp301", "Ls004"]);
  expect(result.truncated).toBe(1);
  expect(result.inputTokens).toBe(TRUNC_USAGE.input_tokens + USAGE.input_tokens);
  expect(result.outputTokens).toBe(
    TRUNC_USAGE.output_tokens + USAGE.output_tokens,
  );

  // Precies twee calls: eerst het paginabudget, dan het retry-plafond.
  expect(calls.length).toBe(2);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_PAGE);
  expect(calls[1].max_tokens).toBe(MAX_TOKENS_RETRY);

  // Eén llm_usage-rij per PAGINA met de exacte som van beide calls:
  // ((1600+2000) × €1 + (4000+300) × €5) / 1M = €0,0251.
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe("0.0251");

  // Eén truncated-event voor poging 1 (niet final: de retry volgde nog).
  const trunc = await eventsByAction(db, "ocr_page_truncated");
  expect(trunc.length).toBe(1);
  expect(trunc[0].entityId).toBe(run.id);
  expect(trunc[0].actor).toBe(ACTOR);
  expect(trunc[0].payload).toMatchObject({
    page: 4,
    attempt: 1,
    maxTokens: MAX_TOKENS_PER_PAGE,
    outputTokens: TRUNC_USAGE.output_tokens,
    final: false,
  });

  const done = await eventsByAction(db, "ocr_page_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({
    page: 4,
    regels: 2,
    truncated: 1,
    attempts: 2,
    tokens: {
      input: TRUNC_USAGE.input_tokens + USAGE.input_tokens,
      output: TRUNC_USAGE.output_tokens + USAGE.output_tokens,
    },
    costEur: 0.0251,
  });
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
});

test("retry kapt wéér af: succes met 0 regels en truncated 2 — nooit {failed}, nooit een derde call", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    truncatedResponse(),
    truncatedResponse(),
  ]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 8,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });

  // GEEN {failed}: dat zou de beeldrij wissen en een hervat-lus starten die
  // opnieuw tegen dezelfde afkapping aanloopt (geldverbranding).
  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels).toEqual([]);
  expect(result.truncated).toBe(2);
  expect(calls.length).toBe(2);

  // Beide pogingen gelogd; de tweede (laatste) is final.
  const trunc = await eventsByAction(db, "ocr_page_truncated");
  expect(trunc.length).toBe(2);
  expect(trunc[0].payload).toMatchObject({
    page: 8,
    attempt: 1,
    maxTokens: MAX_TOKENS_PER_PAGE,
    final: false,
  });
  expect(trunc[1].payload).toMatchObject({
    page: 8,
    attempt: 2,
    maxTokens: MAX_TOKENS_RETRY,
    outputTokens: TRUNC_USAGE.output_tokens,
    final: true,
  });

  const done = await eventsByAction(db, "ocr_page_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ regels: 0, truncated: 2, attempts: 2 });

  // Kosten = som van beide afgekapte calls:
  // (2 × 1600 × €1 + 2 × 4000 × €5) / 1M = €0,0432.
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe("0.0432");
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
});

test("pure laag: readPageWithVision levert attempts-metadata en gesommeerde usage", async () => {
  const { client, calls } = mockClient([
    truncatedResponse(),
    toolResponse([
      { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301" },
    ]),
  ]);

  const result = await readPageWithVision({
    client,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    pageNumber: 11,
  });

  expect(calls.length).toBe(2);
  expect(result.regels.length).toBe(1);
  expect(result.truncated).toBe(1);
  expect(result.attempts).toEqual([
    {
      maxTokens: MAX_TOKENS_PER_PAGE,
      stopReason: "max_tokens",
      inputTokens: TRUNC_USAGE.input_tokens,
      outputTokens: TRUNC_USAGE.output_tokens,
    },
    {
      maxTokens: MAX_TOKENS_RETRY,
      stopReason: "tool_use",
      inputTokens: USAGE.input_tokens,
      outputTokens: USAGE.output_tokens,
    },
  ]);
  expect(result.usage).toEqual({
    inputTokens: TRUNC_USAGE.input_tokens + USAGE.input_tokens,
    outputTokens: TRUNC_USAGE.output_tokens + USAGE.output_tokens,
  });
});

// ── Timeout op de eerste poging (17 jul, live-check Raadhuis) ───────────────
// CALL_TIMEOUT_MS was 30 s; een dichte batch had ~61 s nodig en de SDK gooide
// `APIConnectionTimeoutError` ("Request timed out."). Fix: CALL_TIMEOUT_MS naar
// 120 s (lib/ai/shared.ts) én de eerste poging vangt een timeout op als extra
// retry-trigger naast max_tokens — alleen de eerste poging, nooit de tweede.
test("timeout op de eerste poging → retry slaagt: event + succes, geen {failed}", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const regels = [
    { armatuurcode: "Lr301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lr301" },
  ];
  const { client, calls } = mockClient([
    new Error("Request timed out."),
    toolResponse(regels),
  ]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
    actor: ACTOR,
  });

  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels.map((r) => r.armatuurcode)).toEqual(["Lr301"]);
  // De timeout-poging droeg 0 tokens — kosten zijn dus exact die van de tweede
  // (geslaagde) call: (2000 × €1 + 300 × €5) / 1M = €0,0035 = USAGE_COST.
  expect(result.inputTokens).toBe(USAGE.input_tokens);
  expect(result.outputTokens).toBe(USAGE.output_tokens);
  expect(result.truncated).toBe(0); // een timeout telt niet als afkapping (O3)
  expect(calls.length).toBe(2);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_PAGE);
  expect(calls[1].max_tokens).toBe(MAX_TOKENS_RETRY);

  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe(USAGE_COST);

  const timeoutEvents = await eventsByAction(db, "ocr_page_timeout");
  expect(timeoutEvents.length).toBe(1);
  expect(timeoutEvents[0].entityId).toBe(run.id);
  expect(timeoutEvents[0].actor).toBe(ACTOR);
  expect(timeoutEvents[0].payload).toEqual({
    page: 1,
    tile: 0,
    maxTokens: MAX_TOKENS_PER_PAGE,
  });

  const done = await eventsByAction(db, "ocr_page_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ regels: 1, truncated: 0, attempts: 2 });
  // Geen afkapping gebeurd — de truncated-event-loop slaat de timeout-poging over.
  expect((await eventsByAction(db, "ocr_page_truncated")).length).toBe(0);
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
});

test("timeout op de eerste poging, retry timet óók uit → {failed} zoals voorheen (geen derde poging)", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    new Error("Request timed out."),
    new Error("Request timed out."),
  ]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 2,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });

  // De TWEEDE poging vangt geen timeout meer op (vangTimeout alleen op de
  // eerste) — dus dit blijft {failed}, net als een aanhoudende storing altijd
  // deed. Reservering blijft staan, de beeldrij/tegel kan later hervat worden.
  expect(result).toEqual({ failed: "Request timed out." });
  expect(calls.length).toBe(2);

  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe(OCR_RESERVE_EUR.toFixed(4));

  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(1);
  // Geen "timeout"-event: dat event bewijst een geslaagde stille retry, en die
  // is hier niet gebeurd (de aanroeper zag alleen de uiteindelijke fout).
  expect((await eventsByAction(db, "ocr_page_timeout")).length).toBe(0);
  expect((await eventsByAction(db, "ocr_page_done")).length).toBe(0);
});

test("timeout op de TWEEDE poging (na een echte afkapping) → {failed}, geen stille swallow", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  // Eerste poging kapt legitiem af (max_tokens) → trigger de bestaande retry;
  // de retry zelf timet nu uit. Alleen de EERSTE poging mag een timeout vangen,
  // dus dit moet doorgooien naar {failed}, ongeacht waarom de retry getriggerd werd.
  const { client } = mockClient([
    truncatedResponse(),
    new Error("Request timed out."),
  ]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 3,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });

  expect(result).toEqual({ failed: "Request timed out." });
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(1);
  expect((await eventsByAction(db, "ocr_page_timeout")).length).toBe(0);
});

test("pure laag: timeout op de eerste poging staat als 'timeout' in de attempts-metadata", async () => {
  const { client, calls } = mockClient([
    new Error("Request timed out."),
    toolResponse([
      { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301" },
    ]),
  ]);

  const result = await readPageWithVision({
    client,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    pageNumber: 5,
  });

  expect(calls.length).toBe(2);
  expect(result.attempts).toEqual([
    {
      maxTokens: MAX_TOKENS_PER_PAGE,
      stopReason: "timeout",
      inputTokens: 0,
      outputTokens: 0,
    },
    {
      maxTokens: MAX_TOKENS_RETRY,
      stopReason: "tool_use",
      inputTokens: USAGE.input_tokens,
      outputTokens: USAGE.output_tokens,
    },
  ]);
  expect(result.usage).toEqual({
    inputTokens: USAGE.input_tokens,
    outputTokens: USAGE.output_tokens,
  });
  expect(result.truncated).toBe(0);
  expect(result.regels.map((r) => r.armatuurcode)).toEqual(["Lp301"]);
});

test("een bericht met alleen het woord 'timeout' (niet de exacte SDK-tekst) triggert geen retry", async () => {
  // Regressie-anker voor de bestaande "client-fout"-test hierboven: isTimeoutError
  // toetst specifiek op 'timed out' (de letterlijke Anthropic-SDK-boodschap), niet
  // op elk bericht met "timeout" erin — anders zou dit een ANDERE, generieke
  // netwerkfout ongewenst gaan verdragen als was het een tripwire-timeout.
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([new Error("timeout na 30s")]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 6,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });

  expect(result).toEqual({ failed: "timeout na 30s" });
  expect(calls.length).toBe(1); // geen retry — dit is geen herkende timeout
});

// ── Defensieve parser ────────────────────────────────────────────────────────
test("kapotte tool-output: 0 regels, nooit een crash", async () => {
  // Directe parser-varianten.
  const cases: OcrContentBlock[][] = [
    [], // geen blokken
    [{ type: "text", text: "sorry, geen tool" }],
    [{ type: "tool_use", id: "t", name: "andere_tool", input: { regels: [] } }],
    [{ type: "tool_use", id: "t", name: "lever_regels", input: {} }],
    [
      {
        type: "tool_use",
        id: "t",
        name: "lever_regels",
        input: { regels: "geen array" },
      },
    ],
    [
      {
        type: "tool_use",
        id: "t",
        name: "lever_regels",
        input: { regels: [null, 42, "tekst", { merk: "zonder code" }] },
      },
    ],
  ];
  for (const content of cases) {
    expect(parseLeverRegels(content)).toEqual([]);
  }

  // En end-to-end: kapotte output → succes met 0 regels, geen fail-event.
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client } = mockClient([
    {
      content: [{ type: "text", text: "{{{ kapot" }],
      stop_reason: "end_turn",
      usage: USAGE,
    },
  ]);
  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 3,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });
  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels).toEqual([]);
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
  // De call is wél gemaakt en kost dus gewoon geld — echte kosten in llm_usage.
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe(USAGE_COST);
});

test("ongeldig code-formaat: regel gaat mee maar codeValid=false (zelfde regex als de parser)", async () => {
  const { client } = mockClient([
    toolResponse([
      { armatuurcode: "SASSO-999", merk: "XAL", type: "?", ruwe_tekst: "ruis" },
      { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301" },
    ]),
  ]);
  const { regels } = await readPageWithVision({
    client,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    pageNumber: 2,
  });
  expect(regels.length).toBe(2);
  expect(regels[0]).toMatchObject({ armatuurcode: "SASSO-999", codeValid: false });
  expect(regels[1]).toMatchObject({ armatuurcode: "Lp301", codeValid: true });
});

// ── Plafond per run (B4) ─────────────────────────────────────────────────────
test("plafond: run-som ≥ €1 → skipped budget_run, client niet aangeroepen", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  await db.insert(llmUsage).values({
    purpose: "ocr",
    costEur: OCR_MAX_EUR_PER_RUN.toFixed(4),
    importRunId: run.id,
  });

  const { client, calls } = mockClient([]);
  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 5,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });
  expect(result).toEqual({ skipped: "budget_run" });
  expect(calls.length).toBe(0);
  // Geen reservering geschreven, geen events — skips logt de aanroeper (stap 4).
  expect((await usageRows(db, run.id)).length).toBe(1);
  expect((await eventsByAction(db, "ocr_page_done")).length).toBe(0);
});

test("reservering telt mee: tweede 'gelijktijdige' check weigert terwijl de call loopt", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  // Run staat vlak onder het plafond: 0,99 < 1,00 → de eerste check laat door.
  await db.insert(llmUsage).values({
    purpose: "ocr",
    costEur: "0.9900",
    importRunId: run.id,
  });
  expect((await checkOcrBudget(db, run.id)).ok).toBe(true);

  // Tijdens de in-flight call (reservering staat) doet een 'parallelle' pagina
  // dezelfde check — die MOET weigeren: 0,99 + 0,02 ≥ 1,00.
  let midFlight: OcrBudgetCheck | null = null;
  const { client } = mockClient([toolResponse([])], async () => {
    midFlight = await checkOcrBudget(db, run.id);
  });
  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 6,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });
  expect(isOcrPageSuccess(result)).toBe(true);
  expect(midFlight).toEqual({
    ok: false,
    reason: "budget_run",
    spendEur: 0.99 + OCR_RESERVE_EUR,
    capEur: OCR_MAX_EUR_PER_RUN,
  });
});

// ── Maandbudget (L-06) ───────────────────────────────────────────────────────
test("maandbudget op → skipped budget_month (ook zonder run-uitgaven)", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  await setSetting(db, "llm_budget_eur", 0.5);
  // Uitgaven van een ANDER doel tellen mee in de maandcap (de cap is totaal).
  await db.insert(llmUsage).values({ purpose: "vangnet", costEur: "0.6000" });

  const { client, calls } = mockClient([]);
  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
  });
  expect(result).toEqual({ skipped: "budget_month" });
  expect(calls.length).toBe(0);
  expect((await usageRows(db, run.id)).length).toBe(0);
});

// ── Fout tijdens de call ─────────────────────────────────────────────────────
test("client-fout: ocr_page_failed-event, reservering blijft staan als kostenpost", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client } = mockClient([new Error("timeout na 30s")]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 9,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
    actor: ACTOR,
  });
  expect(result).toEqual({ failed: "timeout na 30s" });

  // De reservering blijft staan (conservatief: te hoog tellen is veilig).
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe(OCR_RESERVE_EUR.toFixed(4));

  const failed = await eventsByAction(db, "ocr_page_failed");
  expect(failed.length).toBe(1);
  expect(failed[0].entityId).toBe(run.id);
  expect(failed[0].payload).toMatchObject({ page: 9, melding: "timeout na 30s" });
  expect((await eventsByAction(db, "ocr_page_done")).length).toBe(0);
});

// ── Geen key ─────────────────────────────────────────────────────────────────
test("geen client en geen key → skipped no_key, niets geschreven", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 1,
    imageBytes: IMAGE,
    mime: "image/jpeg",
  });
  expect(result).toEqual({ skipped: "no_key" });
  expect((await usageRows(db, run.id)).length).toBe(0);
  // Het skip-event hoort bij de aanroeper (stap 4) — hier dus géén events.
  expect((await eventsByAction(db, "ocr_page_done")).length).toBe(0);
  expect((await eventsByAction(db, "ocr_page_failed")).length).toBe(0);
});

// ── O4 (goal-import-ai-leesroute stap 5): tegel-bewuste call ─────────────────
// Alle tests hierboven draaien zonder tile-opt en pinnen het oude gedrag vast
// (afwezig = hele pagina, call byte-identiek). Eén echte tegel erbij: de
// user-content krijgt de sectie-zin en het done-event draagt het tegelnummer.
test("tegel {n:3, count:12}: sectie-zin in de user-content, tile 3 in het done-event", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([toolResponse([])]);

  const result = await ocrPage(db, {
    importRunId: run.id,
    pageNumber: 5,
    imageBytes: IMAGE,
    mime: "image/jpeg",
    client,
    actor: ACTOR,
    tile: { n: 3, count: 12 },
  });
  if (!isOcrPageSuccess(result)) throw new Error("verwachtte succes");

  // De extra zin noemt de sectie én de ECHTE pagina, en instrueert afgesneden
  // rijen over te slaan (de tegel-overlap garandeert dat ze elders compleet staan).
  const userText = calls[0].messages[0].content
    .filter(
      (c): c is Extract<(typeof calls)[0]["messages"][0]["content"][0], { type: "text" }> =>
        c.type === "text",
    )
    .map((c) => c.text)
    .join("\n");
  expect(userText).toContain("section 3 of 12 of page 5");
  expect(userText).toContain("Skip rows that are cut off at the image edges");
  // De basisinstructie met de echte pagina blijft ongewijzigd staan.
  expect(userText).toContain("page 5 of this luminaire schedule");

  const done = await eventsByAction(db, "ocr_page_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ page: 5, tile: 3 });
});
