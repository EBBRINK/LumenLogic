// AI-tekstleesroute (goal-import-ai-leesroute, stap 3, fase A) met een gemockte
// client en PGlite: prompt-/toolcompositie (de refactor van ocr.ts is byte-neutraal),
// de router (beslisRoute), de tekst-call op de codestijl-fixtures, de paginafallback,
// de tripwire met batch-retry en per-pagina-escalatie, het reserveringspatroon en de
// events. De module schrijft NOOIT spec-regels — dat is fase B.
//
// Let op codeValid: de CODE-regex (lib/pdf/armaturenboek.ts) eist een kleine letter
// na de hoofdletter (Lp301 wél, L004/Lr001B níét). Voor de leesroute is dat een
// VERTROUWENSSIGNAAL, geen poort: KvK-/TNO-stijl-codes komen gewoon door, met
// codeValid: false — fase B beslist wat de review ermee doet.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { events, importRuns, llmUsage, projectDossiers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import {
  LEVER_REGELS_TOOL,
  MAX_TOKENS_PER_PAGE,
  MAX_TOKENS_RETRY,
  OCR_MAX_EUR_PER_RUN,
  OCR_MODEL,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_KERN,
  type OcrClient,
  type OcrMessageParams,
  type OcrResponse,
} from "@/lib/ai/ocr";
import {
  beslisRoute,
  isLeesrouteBatchSuccess,
  leesrouteBatch,
  LEESROUTE_RESERVE_EUR,
  LEESROUTE_SYSTEM_PROMPT,
  LEVER_REGELS_TOOL_TEKST,
  MAX_TOKENS_BATCH_RETRY,
  MAX_TOKENS_PER_BATCH,
  readPagesTextWithModel,
} from "@/lib/ai/leesroute";
import { KVK_FIXTURE, TNO_FIXTURE } from "@/lib/pdf/codestijl-fixtures";

const ACTOR = "eduard@brinklicht.nl";
const USAGE = { input_tokens: 2000, output_tokens: 300 };
// (2000 × €1 + 300 × €5) / 1M = €0,0035
const USAGE_COST = "0.0035";

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

// Afgekapte respons (tripwire): bij max_tokens midden in een tool_use-blok
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
    .values({ name: "Leesroute", phase: "tender" })
    .returning();
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: dossier.id,
      source: "pdf",
      filename: "boek.pdf",
      rows: [],
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

// ── 1. Prompt- en toolcompositie: de ocr.ts-refactor is byte-neutraal ────────
test("vision-SYSTEM_PROMPT is byte-identiek aan de vastgelegde literal", () => {
  // De volledige prompt als snapshot: intro + kern. Wijzigt de compositie ook
  // maar één byte, dan faalt deze test — elke promptwijziging is daardoor een
  // bewuste, gemotiveerde testwijziging. Historie: stap 2 perkte de lege-lijst-
  // regel in; stap 6 (O6) voegde de aantal-regel toe (aantallen alleen als ze
  // er létterlijk staan — Dordrecht-pen-aantallen; nooit raden of 1 defaulten).
  // 11 aug: de artikelnummer-regel erbij. Gemeten aanleiding — een offerte-
  // aanvraag heeft géén positiecodes maar wél een kolom 'Artikelnummer', en van
  // de drie nummers mét spatie kwam er nul heel binnen: "21012 0298" werd
  // "21012", "32812 9220 BRBB" werd "92730" (een getal uit de omschrijving).
  // Zie docs/probleem-artikelnummer-matching.md, meting 1.
  const VASTGELEGDE_LITERAL =
    "You read one page image from a luminaire schedule ('armaturenboek'). " +
    "Extract the luminaire rows and deliver them with the lever_regels tool.\n" +
    "Rules:\n" +
    "- Report ONLY what is literally printed on the page. Never invent, guess, " +
    "complete or normalise codes, brands or types.\n" +
    "- A row typically starts with a fixture code such as Lp301, Ls004 or Lw201-a, " +
    "followed by a brand and a product type.\n" +
    "- Some documents are not luminaire schedules but order requests: a table per " +
    "brand with the columns description, article number ('Artikelnummer') and " +
    "quantity, and no fixture codes at all. There the article number is the last " +
    "field of the row, it belongs to the manufacturer, and it may contain spaces " +
    "('21012 0298', '32812 9220 BRBB'). Deliver it complete in artikelnummer — " +
    "never only its first part, and never a number you took from the description. " +
    "When such a row has no fixture code, use that same complete article number as " +
    "armatuurcode.\n" +
    "- Put the complete literal row text in ruwe_tekst.\n" +
    "- Only if the page truly contains no luminaire rows at all (a cover, a photo " +
    "page, a floor plan, a completely blank page), deliver an empty list.\n" +
    "- If the page shows even one luminaire row, deliver every single row on the " +
    "page. Never deliver an empty or shortened list because the page is long, " +
    "dense or hard to read.\n" +
    "- Report a quantity (aantal) only when a number is literally printed or " +
    "handwritten next to the row — a count in the margin counts, a wattage or " +
    "dimension does not. No quantity printed for the row → aantal is null; " +
    "never guess and never default to 1.\n" +
    "- Prices do not exist for you; never read, mention or estimate them.\n" +
    "- You make no decisions and no judgements — you only transcribe.";
  expect(SYSTEM_PROMPT).toBe(VASTGELEGDE_LITERAL);
});

test("LEESROUTE_SYSTEM_PROMPT bevat de gedeelde kern én de merkkolom-regel", () => {
  expect(LEESROUTE_SYSTEM_PROMPT).toContain(SYSTEM_PROMPT_KERN);
  expect(LEESROUTE_SYSTEM_PROMPT).toContain(
    "The brand is the manufacturer column — never a room, space or function " +
      "name such as Raadzaal, Toilet, Woonkamer, Vergaderruimte.",
  );
  // Eigen tekstlaag-intro, niet de vision-intro.
  expect(LEESROUTE_SYSTEM_PROMPT).toContain("raw text layer");
  expect(LEESROUTE_SYSTEM_PROMPT).not.toContain("one page image");
});

test("LEVER_REGELS_TOOL_TEKST eist pagina; het OCR-schema bleef byte-gelijk", () => {
  // Vastgelegde kopie van het OCR-toolschema. De structurele spread in
  // leesroute.ts mag het origineel niet raken. Historie: stap 6 (O6) voegde
  // het aantal-veld toe aan het koppelcontract — beeld én tekst lezen
  // aantallen, alleen als ze er letterlijk staan.
  const OUDE_TOOL = {
    name: "lever_regels",
    description:
      "Deliver ALL luminaire rows that are literally printed on this page, " +
      "every single one. An empty list is only correct when the page contains " +
      "no luminaire rows at all.",
    input_schema: {
      type: "object",
      properties: {
        regels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              armatuurcode: {
                type: "string",
                description:
                  "The fixture code exactly as printed, e.g. Lp301 or Ls004-a",
              },
              merk: {
                type: ["string", "null"],
                description: "Brand name as printed, or null if not readable",
              },
              type: {
                type: ["string", "null"],
                description:
                  "Product type/description as printed, or null if not readable",
              },
              ruwe_tekst: {
                type: "string",
                description:
                  "The full row text exactly as printed on the page",
              },
              artikelnummer: {
                type: ["string", "null"],
                description:
                  "The supplier/manufacturer article number for this row, " +
                  "complete and exactly as printed INCLUDING any spaces " +
                  "(e.g. '21012 0298', '32812 9220 BRBB'). Only from an article " +
                  "number column or label — never a number taken from the " +
                  "description text. Null if the row has none.",
              },
              aantal: {
                type: ["number", "null"],
                description:
                  "The quantity for this row, only if a number is literally " +
                  "printed or handwritten next to the row (e.g. a count in " +
                  "the margin); otherwise null. Never guess or default to 1.",
              },
            },
            required: ["armatuurcode", "ruwe_tekst"],
          },
        },
      },
      required: ["regels"],
    },
  };
  expect(JSON.stringify(LEVER_REGELS_TOOL)).toBe(JSON.stringify(OUDE_TOOL));

  // De tekstvariant: zelfde naam (afleverkanaal), pagina VERPLICHT erbij.
  const items = (
    LEVER_REGELS_TOOL_TEKST.input_schema as {
      properties: {
        regels: { items: { properties: Record<string, unknown>; required: string[] } };
      };
    }
  ).properties.regels.items;
  expect(LEVER_REGELS_TOOL_TEKST.name).toBe("lever_regels");
  expect(items.required).toEqual(["armatuurcode", "ruwe_tekst", "pagina"]);
  expect(items.properties.pagina).toMatchObject({ type: "integer" });
});

// ── 2. beslisRoute (puur) ────────────────────────────────────────────────────
test("beslisRoute: 0 regels → leesroute/geen_regels, zonder delen-door-0", () => {
  expect(beslisRoute([])).toEqual({
    route: "leesroute",
    reden: "geen_regels",
    bekendeMerken: 0,
    totaal: 0,
  });
});

test("beslisRoute: dekking onder/op/boven de 60%-drempel", () => {
  const bekend = { brandText: "XAL" };
  const onbekend = { brandText: null };
  // 5/9 = 55,6% < 60% → leesroute.
  expect(
    beslisRoute([...Array(5).fill(bekend), ...Array(4).fill(onbekend)]),
  ).toEqual({
    route: "leesroute",
    reden: "merkdekking",
    bekendeMerken: 5,
    totaal: 9,
  });
  // 6/10 = precies 60% → inclusief: deterministisch.
  expect(
    beslisRoute([...Array(6).fill(bekend), ...Array(4).fill(onbekend)]),
  ).toEqual({ route: "deterministisch", bekendeMerken: 6, totaal: 10 });
  // 10/10 → deterministisch.
  expect(beslisRoute(Array(10).fill(bekend))).toEqual({
    route: "deterministisch",
    bekendeMerken: 10,
    totaal: 10,
  });
});

// ── 3. De tekst-call op de KvK-huisstijl (pure laag) ─────────────────────────
test("KvK-stijl: tekstblok met PAGE-marker, geen image, geen prijs; L004 komt door met codeValid:false", async () => {
  const { client, calls } = mockClient([
    toolResponse([
      {
        armatuurcode: "L004",
        merk: null,
        type: "ronde pendelreeks",
        ruwe_tekst: "boven de balie een ronde pendelreeks, aangeduid als L004",
        pagina: 1,
      },
    ]),
  ]);

  const result = await readPagesTextWithModel({
    client,
    pages: [{ pageNumber: 1, text: KVK_FIXTURE }],
  });

  // Call-vorm: één tekstblok (geen image) met de marker + de volledige
  // fixture-tekst, geforceerde lever_regels-tool, batchbudget eerst.
  expect(calls.length).toBe(1);
  expect(calls[0].model).toBe(OCR_MODEL);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_BATCH);
  expect(calls[0].tool_choice).toEqual({ type: "tool", name: "lever_regels" });
  expect(calls[0].messages[0].content.length).toBe(1);
  const [blok] = calls[0].messages[0].content;
  if (blok.type !== "text") throw new Error("verwachtte een tekstblok");
  expect(blok.text).toContain("=== PAGE 1 ===");
  expect(blok.text).toContain(KVK_FIXTURE);
  expect(calls[0].messages[0].content.some((c) => c.type === "image")).toBe(
    false,
  );
  // Regel 2: de hele call bevat nooit prijzen of catalogus-context.
  expect(JSON.stringify(calls[0]).toLowerCase()).not.toContain("prijs");
  expect(calls[0].tools.length).toBe(1);

  // De regel komt door — codeValid is signaal, geen poort (zie testkop).
  expect(result.regels).toEqual([
    {
      armatuurcode: "L004",
      merk: null,
      type: "ronde pendelreeks",
      ruweTekst: "boven de balie een ronde pendelreeks, aangeduid als L004",
      codeValid: false,
      aantal: null, // O6: geen aantal geleverd → null (nooit geraden)
      artikelnummer: null, // geen artikelnummerkolom in dit document
      pagina: 1,
    },
  ]);
  expect(result.paginaOnbekend).toBe(0);
  expect(result.truncated).toBe(0);
});

// ── 4. TNO-stijl: suffix-varianten blijven eigen regels ─────────────────────
test("TNO-stijl: Lr001 en Lr001B als aparte regels, merk exact zoals geleverd", async () => {
  const { client } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lr001",
        merk: "Fenolux",
        type: "NOVA 300 rond",
        ruwe_tekst: "Lr001 Vergaderruimte Fenolux NOVA 300 rond 3000K 6 21",
        pagina: 1,
      },
      {
        armatuurcode: "Lr001B",
        merk: "Fenolux",
        type: "NOVA 300 rond zwart",
        ruwe_tekst: "Lr001B Vergaderruimte Fenolux NOVA 300 rond zwart 3000K 2 21",
        pagina: 1,
      },
    ]),
  ]);

  const result = await readPagesTextWithModel({
    client,
    pages: [{ pageNumber: 1, text: TNO_FIXTURE }],
  });

  expect(result.regels.length).toBe(2);
  expect(result.regels[0]).toMatchObject({
    armatuurcode: "Lr001",
    merk: "Fenolux",
    codeValid: true,
  });
  // De variant is een EIGEN regel, niet opgeslokt in de basiscode; de regex
  // kent het suffix niet → codeValid false (signaal).
  expect(result.regels[1]).toMatchObject({
    armatuurcode: "Lr001B",
    merk: "Fenolux",
    codeValid: false,
  });
});

// ── 5. Paginafallback ────────────────────────────────────────────────────────
test("paginafallback: buiten de batch of ontbrekend → eerste batchpagina + geteld", async () => {
  const { client } = mockClient([
    toolResponse([
      { armatuurcode: "Lp301", ruwe_tekst: "Lp301", pagina: 99 }, // buiten batch
      { armatuurcode: "Lp302", ruwe_tekst: "Lp302" }, // zonder pagina
      { armatuurcode: "Lp303", ruwe_tekst: "Lp303", pagina: 4 }, // geldig
    ]),
  ]);

  const result = await readPagesTextWithModel({
    client,
    pages: [
      { pageNumber: 3, text: "tekst pagina 3" },
      { pageNumber: 4, text: "tekst pagina 4" },
    ],
  });

  expect(result.regels.map((r) => [r.armatuurcode, r.pagina])).toEqual([
    ["Lp301", 3],
    ["Lp302", 3],
    ["Lp303", 4],
  ]);
  expect(result.paginaOnbekend).toBe(2);
});

// ── 6. Tripwire via leesrouteBatch (PGlite) ──────────────────────────────────
test("afkapping: één retry op het batch-retryplafond — kosten som, events kloppen", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    truncatedResponse(),
    toolResponse([
      { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301", pagina: 1 },
      { armatuurcode: "Lp302", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp302", pagina: 2 },
    ]),
  ]);

  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [
      { pageNumber: 1, text: "tekst 1" },
      { pageNumber: 2, text: "tekst 2" },
    ],
    client,
    actor: ACTOR,
  });

  if (!isLeesrouteBatchSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels.map((r) => [r.armatuurcode, r.pagina])).toEqual([
    ["Lp301", 1],
    ["Lp302", 2],
  ]);
  expect(result.truncated).toBe(1);

  // Precies twee calls: batchbudget → batch-retryplafond. GEEN escalatie (de
  // retry slaagde).
  expect(calls.length).toBe(2);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_BATCH);
  expect(calls[1].max_tokens).toBe(MAX_TOKENS_BATCH_RETRY);

  // Eén llm_usage-rij met de exacte som van beide calls:
  // ((1600+2000) × €1 + (4000+300) × €5) / 1M = €0,0251.
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].purpose).toBe("leesroute");
  expect(rows[0].costEur).toBe("0.0251");

  // Eén truncated-event voor poging 1 (niet final: de retry volgde nog).
  const trunc = await eventsByAction(db, "leesroute_batch_truncated");
  expect(trunc.length).toBe(1);
  expect(trunc[0].entityId).toBe(run.id);
  expect(trunc[0].actor).toBe(ACTOR);
  expect(trunc[0].payload).toMatchObject({
    paginas: [1, 2],
    attempt: 1,
    maxTokens: MAX_TOKENS_PER_BATCH,
    outputTokens: TRUNC_USAGE.output_tokens,
    final: false,
  });

  const done = await eventsByAction(db, "leesroute_batch_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({
    paginas: [1, 2],
    regels: 2,
    truncated: 1,
    attempts: 2,
    costEur: 0.0251,
  });
  expect((await eventsByAction(db, "leesroute_batch_failed")).length).toBe(0);
});

// ── Timeout op de eerste poging (17 jul, live-check Raadhuis) ───────────────
// Dossier ae0eead9, run daf7c660: batches op pagina 1 en 4 gaven
// leesroute_batch_failed met "Request timed out." — CALL_TIMEOUT_MS (toen 30 s)
// was te krap voor een dichte batch (~61 s nodig). Fix: 120 s + de eerste
// poging vangt een timeout op als extra retry-trigger (spiegelt lib/ai/ocr.ts).
test("timeout op de eerste poging → retry slaagt: leesroute_batch_timeout-event, geen {failed}", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    new Error("Request timed out."),
    toolResponse([
      { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301", pagina: 1 },
    ]),
  ]);

  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [{ pageNumber: 1, text: "tekst 1" }],
    client,
    actor: ACTOR,
  });

  if (!isLeesrouteBatchSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels.map((r) => r.armatuurcode)).toEqual(["Lp301"]);
  expect(result.truncated).toBe(0); // een timeout is geen afkapping (O3)
  expect(calls.length).toBe(2);
  expect(calls[0].max_tokens).toBe(MAX_TOKENS_PER_BATCH);
  expect(calls[1].max_tokens).toBe(MAX_TOKENS_BATCH_RETRY);

  // De timeout-poging droeg 0 tokens — kosten zijn dus exact die van de
  // geslaagde tweede call: USAGE_COST.
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].purpose).toBe("leesroute");
  expect(rows[0].costEur).toBe(USAGE_COST);

  const timeoutEvents = await eventsByAction(db, "leesroute_batch_timeout");
  expect(timeoutEvents.length).toBe(1);
  expect(timeoutEvents[0].entityId).toBe(run.id);
  expect(timeoutEvents[0].actor).toBe(ACTOR);
  expect(timeoutEvents[0].payload).toEqual({
    paginas: [1, 1],
    maxTokens: MAX_TOKENS_PER_BATCH,
  });

  const done = await eventsByAction(db, "leesroute_batch_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ regels: 1, truncated: 0, attempts: 2 });
  expect((await eventsByAction(db, "leesroute_batch_truncated")).length).toBe(0);
  expect((await eventsByAction(db, "leesroute_batch_failed")).length).toBe(0);
});

test("timeout op de eerste poging, retry timet óók uit → {failed} zoals voorheen (geen escalatie, geen derde poging)", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    new Error("Request timed out."),
    new Error("Request timed out."),
  ]);

  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [
      { pageNumber: 1, text: "tekst 1" },
      { pageNumber: 2, text: "tekst 2" },
    ],
    client,
    actor: ACTOR,
  });

  // De TWEEDE poging vangt geen timeout meer op — dit blijft {failed}, precies
  // zoals een aanhoudende storing vóór deze fix ook al deed. Geen per-pagina-
  // escalatie: die triggert alleen op een echte (max_tokens-)afkapping van de
  // laatste poging, en die is hier nooit gehaald (de call wierp een fout).
  if (isLeesrouteBatchSuccess(result) || !("failed" in result)) {
    throw new Error("verwachtte {failed}");
  }
  expect(result.failed).toBe("Request timed out.");
  expect(calls.length).toBe(2);

  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].costEur).toBe(LEESROUTE_RESERVE_EUR.toFixed(4));

  expect((await eventsByAction(db, "leesroute_batch_failed")).length).toBe(1);
  expect((await eventsByAction(db, "leesroute_batch_timeout")).length).toBe(0);
  expect((await eventsByAction(db, "leesroute_batch_done")).length).toBe(0);
});

test("dubbele afkap op 2 pagina's → per-pagina-escalatie op de paginabudgetten, aggregatie en events per stap", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([
    truncatedResponse(), // batch, poging 1 (8000)
    truncatedResponse(), // batch, poging 2 (16000) — óók afgekapt → escalatie
    toolResponse([
      { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301", pagina: 1 },
    ]),
    toolResponse([
      { armatuurcode: "Lp302", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp302", pagina: 2 },
    ]),
  ]);

  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [
      { pageNumber: 1, text: "tekst 1" },
      { pageNumber: 2, text: "tekst 2" },
    ],
    client,
    actor: ACTOR,
  });

  if (!isLeesrouteBatchSuccess(result)) throw new Error("verwachtte succes");
  // Aggregatie: regels van de twee paginacalls; kosten/tokens/truncated
  // INCLUSIEF de afgekapte batchcall.
  expect(result.regels.map((r) => [r.armatuurcode, r.pagina])).toEqual([
    ["Lp301", 1],
    ["Lp302", 2],
  ]);
  expect(result.truncated).toBe(2);
  expect(result.inputTokens).toBe(2 * TRUNC_USAGE.input_tokens + 2 * USAGE.input_tokens);
  expect(result.outputTokens).toBe(
    2 * TRUNC_USAGE.output_tokens + 2 * USAGE.output_tokens,
  );
  // 2× afgekapt (€0,0432) + 2× paginacall (€0,0035) = €0,0502.
  expect(result.costEur).toBeCloseTo(0.0502, 10);

  // Vier calls: batch (8000, 16000), daarna per pagina op de VISION-budgetten.
  expect(calls.map((c) => c.max_tokens)).toEqual([
    MAX_TOKENS_PER_BATCH,
    MAX_TOKENS_BATCH_RETRY,
    MAX_TOKENS_PER_PAGE,
    MAX_TOKENS_PER_PAGE,
  ]);
  // De escalatiecalls bevatten alléén de eigen pagina.
  const call3 = calls[2].messages[0].content[0];
  const call4 = calls[3].messages[0].content[0];
  if (call3.type !== "text" || call4.type !== "text")
    throw new Error("verwachtte tekstblokken");
  expect(call3.text).toContain("=== PAGE 1 ===");
  expect(call3.text).not.toContain("=== PAGE 2 ===");
  expect(call4.text).toContain("=== PAGE 2 ===");
  expect(call4.text).not.toContain("=== PAGE 1 ===");

  // Drie reserveringen → drie bijgewerkte rijen: batch + 2 pagina's.
  const rows = await usageRows(db, run.id);
  expect(rows.map((r) => r.costEur).sort()).toEqual([
    "0.0035",
    "0.0035",
    "0.0432",
  ]);

  // Events per stap: 2 truncated (batch), 3 done (batch + 2 pagina's).
  const trunc = await eventsByAction(db, "leesroute_batch_truncated");
  expect(trunc.length).toBe(2);
  expect(trunc[0].payload).toMatchObject({
    paginas: [1, 2],
    attempt: 1,
    maxTokens: MAX_TOKENS_PER_BATCH,
    final: false,
  });
  expect(trunc[1].payload).toMatchObject({
    paginas: [1, 2],
    attempt: 2,
    maxTokens: MAX_TOKENS_BATCH_RETRY,
    final: true,
  });
  const done = await eventsByAction(db, "leesroute_batch_done");
  expect(done.length).toBe(3);
  expect(done[0].payload).toMatchObject({
    paginas: [1, 2],
    regels: 0,
    truncated: 2,
    attempts: 2,
  });
  expect(done[1].payload).toMatchObject({ paginas: [1, 1], regels: 1, truncated: 0 });
  expect(done[2].payload).toMatchObject({ paginas: [2, 2], regels: 1, truncated: 0 });
  expect((await eventsByAction(db, "leesroute_batch_failed")).length).toBe(0);
});

test("leeg antwoord met stop_reason tool_use: precies één call, nul truncated-events", async () => {
  // KvK heeft ~50 écht lege pagina's — een retry-op-leeg zou 50 extra betaalde
  // calls verbranden. Leeg + "tool_use" is legitiem blanco.
  const db = await createTestDb();
  const run = await seedRun(db);
  const { client, calls } = mockClient([toolResponse([])]);

  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [{ pageNumber: 12, text: "lege conceptpagina" }],
    client,
  });

  if (!isLeesrouteBatchSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels).toEqual([]);
  expect(result.truncated).toBe(0);
  expect(calls.length).toBe(1);
  expect((await eventsByAction(db, "leesroute_batch_truncated")).length).toBe(0);
  const done = await eventsByAction(db, "leesroute_batch_done");
  expect(done.length).toBe(1);
  expect(done[0].payload).toMatchObject({ paginas: [12, 12], regels: 0 });
});

test("budget vooraf op → skipped budget_run, geen call, geen reservering erbij", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  // Het plafond is GEDEELD met OCR: een 'ocr'-rij telt mee tegen de €1-cap.
  await db.insert(llmUsage).values({
    purpose: "ocr",
    costEur: OCR_MAX_EUR_PER_RUN.toFixed(4),
    importRunId: run.id,
  });

  const { client, calls } = mockClient([]);
  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [{ pageNumber: 1, text: "tekst" }],
    client,
  });

  expect(result).toEqual({ skipped: "budget_run" });
  expect(calls.length).toBe(0);
  // Geen reservering erbij, geen events — skips logt de aanroeper (fase B).
  expect((await usageRows(db, run.id)).length).toBe(1);
  expect((await eventsByAction(db, "leesroute_batch_done")).length).toBe(0);
});

// ── 7. Happy path: reservering vóór de call, echte kosten erna ──────────────
test("happy path: reservering (€0,16) staat tijdens de call en wordt bijgewerkt naar echte kosten", async () => {
  const db = await createTestDb();
  const run = await seedRun(db);
  let midFlight: string | null = null;
  const { client } = mockClient(
    [
      toolResponse([
        { armatuurcode: "Lp301", merk: "XAL", type: "SASSO", ruwe_tekst: "Lp301", pagina: 1 },
        { armatuurcode: "L004", merk: null, type: null, ruwe_tekst: "L004", pagina: 2 },
      ]),
    ],
    async () => {
      const rows = await usageRows(db, run.id);
      midFlight = rows.length === 1 ? rows[0].costEur : null;
    },
  );

  const result = await leesrouteBatch(db, {
    importRunId: run.id,
    pages: [
      { pageNumber: 1, text: "tekst 1" },
      { pageNumber: 2, text: "tekst 2" },
    ],
    client,
    actor: ACTOR,
  });

  if (!isLeesrouteBatchSuccess(result)) throw new Error("verwachtte succes");
  expect(result.regels.length).toBe(2);
  expect(result.paginaOnbekend).toBe(0);

  // Tijdens de call stond de reservering al in llm_usage (de SUM-check van een
  // parallelle call telt haar mee) …
  expect(midFlight).toBe(LEESROUTE_RESERVE_EUR.toFixed(4));
  // … en erna is precies die rij bijgewerkt naar de echte kosten.
  const rows = await usageRows(db, run.id);
  expect(rows.length).toBe(1);
  expect(rows[0].purpose).toBe("leesroute");
  expect(rows[0].costEur).toBe(USAGE_COST);

  const done = await eventsByAction(db, "leesroute_batch_done");
  expect(done.length).toBe(1);
  expect(done[0].entityId).toBe(run.id);
  expect(done[0].actor).toBe(ACTOR);
  expect(done[0].payload).toMatchObject({
    paginas: [1, 2],
    regels: 2,
    codeInvalid: 1, // L004: hoofdletter zonder kleine letter → signaal
    paginaOnbekend: 0,
    tokens: { input: USAGE.input_tokens, output: USAGE.output_tokens },
    costEur: Number(USAGE_COST),
    truncated: 0,
    attempts: 1,
  });
  expect((await eventsByAction(db, "leesroute_batch_failed")).length).toBe(0);
});
