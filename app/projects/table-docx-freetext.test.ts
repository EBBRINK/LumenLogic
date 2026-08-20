// Regressie: een docx ZONDER tabellen maar MET vrije tekst moet redirecten, niet
// "kon niet geparst worden" melden (gevonden 2026-08-20).
//
// De redirect naar `?tabel=<n>&run=<id>` stond binnen de try die op een kale
// `} catch {` eindigt met reject("parse_fout"). Next' redirect() werkt door te GOOIEN
// (NEXT_REDIRECT-digest), dus die catch ving het navigatiesignaal van een GESLAAGDE
// import: de gebruiker kreeg "The file could not be parsed." terwijl de regels al in
// de database stonden, plus een misleidend tabel_import_rejected-event. Dezelfde
// foutklasse als de lege catch in CLAUDE.md, maar serverkant in plaats van via
// callAction.
//
// Daarom meet deze test alle drie tegelijk: het redirect-signaal, de weggeschreven
// regels, en de AFWEZIGHEID van het rejected-event. Alleen op de redirect meten zou
// een fix accepteren die stilletjes stopt met importeren.
//
// Harnas: PGlite in plaats van Neon, sessie gemockt, revalidatePath uitgezet — zelfde
// opzet als app/projects/actions-validation.test.ts. Twee naden zijn gemockt en de
// rest is echt: rowsFromDocx (anders moet er een echte .docx in de repo) en de
// Anthropic-client (anders belt de leesroute het internet). Het hele pad ertussen —
// recordDocxFreeTextImport, leesrouteRijenBatch, recordTableImport — draait echt.
import { and, eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { events, importRuns, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { seedInternLid } from "@/db/test-org";
import type { OcrClient, OcrResponse } from "@/lib/ai/ocr";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ACTOR = "eduard@brinklicht.nl";

const FREE_TEXT =
  "Armaturenstaat gebouw B\n" +
  "Lp301 XAL SASSO 100, 12 stuks, 3000 K\n" +
  "\n" +
  "boven de balie een ronde pendelreeks, aangeduid als L004";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "eduard@brinklicht.nl",
  // Wat rowsFromDocx teruggeeft. `rows: []` = een docx zonder tabellen; de vrije
  // tekst is dan het enige dat er in zit.
  docx: { rows: [] as string[][], freeText: "" },
  // Laat rowsFromDocx gooien — de tegenproef onderaan.
  docxKapot: false,
  // Scripted antwoorden voor de gemockte Anthropic-client.
  aiResponses: [] as OcrResponse[],
}));

vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const waarde = echt[prop];
        return typeof waarde === "function" ? waarde.bind(echt) : waarde;
      },
    },
  ),
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { email: harnas.email } }),
  requireSession: async () => ({ user: { email: harnas.email } }),
  getActor: async () => harnas.email,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("@/lib/table/rows-from-docx", () => ({
  rowsFromDocx: async () => {
    if (harnas.docxKapot) throw new Error("geen geldige docx");
    return harnas.docx;
  },
}));

// Alleen de client-fabriek vervangen, de rest van lib/ai/ocr blijft echt — zo lopen
// de budgetcontrole, parseLeverRegels en de kostenboekhouding gewoon mee.
vi.mock("@/lib/ai/ocr", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/ai/ocr")>();
  return {
    ...echt,
    createAnthropicOcrClient: (): OcrClient => ({
      async createMessage() {
        const next = harnas.aiResponses.shift();
        if (!next) throw new Error("mock-client: geen respons meer in het script");
        return next;
      },
    }),
  };
});

const { finishTableImportAction } = await import("./actions");
const { createDossier } = await import("@/lib/repo/dossiers");
const { addSourceChunk, startTableImport } = await import(
  "@/lib/repo/source-files"
);

function toolResponse(regels: unknown): OcrResponse {
  return {
    content: [
      { type: "tool_use", id: "tu_1", name: "lever_regels", input: { regels } },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 2000, output_tokens: 300 },
  };
}

// De echte docx-bytes doen er niet toe (rowsFromDocx is gemockt), maar de
// magic-bytes-poort in de action wil een PK-zipcontainer zien.
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);

async function seed() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  await seedInternLid(db, harnas.email);
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "310.00",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, {
    orgId: null,
    name: "Docx zonder tabellen",
  });
  const { run } = await startTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.docx",
    actor: ACTOR,
  });
  await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.docx",
    mime: DOCX_MIME,
    chunk: 0,
    bytes: ZIP_BYTES,
  });
  return { db, dossier, run };
}

// Het redirect-signaal van Next is een throw met `digest` "NEXT_REDIRECT;…;<url>;…".
// Loopt de action door — of geeft hij `{ error }` terug — dan faalt deze helper met
// een leesbare reden in plaats van pas bij de assertie eronder.
async function vangRedirect(
  // De action kan sinds de tabbladkeuze ook { sheetChoice } teruggeven; die tak raakt
  // het docx-pad niet, maar het type moet hem wel kennen.
  run: () => Promise<{ error: string } | { sheetChoice: unknown } | void>,
): Promise<string> {
  let uitkomst: { error: string } | { sheetChoice: unknown } | void;
  try {
    uitkomst = await run();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest;
    throw e;
  }
  throw new Error(
    `de action redirecte niet maar gaf terug: ${JSON.stringify(uitkomst)}`,
  );
}

const OUDE_KEY = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (OUDE_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OUDE_KEY;
  harnas.aiResponses = [];
  harnas.docxKapot = false;
});

test("docx zonder tabellen maar mét vrije tekst redirect, en meldt geen parse-fout", async () => {
  const { db, dossier, run } = await seed();
  process.env.ANTHROPIC_API_KEY = "test-key"; // anders stopt het pad al vóór de leesroute
  harnas.docx = { rows: [], freeText: FREE_TEXT };
  harnas.aiResponses = [
    toolResponse([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp301 XAL SASSO 100, 12 stuks, 3000 K",
        rij: 2,
      },
      {
        armatuurcode: "L004",
        merk: null,
        type: "ronde pendelreeks",
        ruwe_tekst: "boven de balie een ronde pendelreeks, aangeduid als L004",
        rij: 4,
      },
    ]),
  ];

  const digest = await vangRedirect(() =>
    finishTableImportAction({ dossierId: dossier.id, runId: run.id }),
  );

  // De redirect is het succes-signaal: 2 regels gelezen, op déze run.
  expect(digest).toContain(`/projects/${dossier.id}?tabel=2&run=${run.id}`);

  // …en dat signaal moet kloppen: de regels staan er echt.
  const lines = await db
    .select()
    .from(specLines)
    .where(eq(specLines.dossierId, dossier.id));
  expect(lines.map((l) => l.fixtureCode).sort()).toEqual(["L004", "Lp301"]);

  // De kern van de regressie: géén afwijzing op een geslaagde import.
  const afgewezen = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.entityId, run.id),
        eq(events.action, "tabel_import_rejected"),
      ),
    );
  expect(afgewezen).toHaveLength(0);

  // Wel het gewone opslagevent, met het vrije-tekst-pad erin herkenbaar.
  const opgeslagen = await db
    .select()
    .from(events)
    .where(
      and(eq(events.entityId, run.id), eq(events.action, "source_file_stored")),
    );
  expect(opgeslagen).toHaveLength(1);
  expect((opgeslagen[0]!.payload as { kind?: string }).kind).toBe(
    "docx_vrije_tekst",
  );

  const [afgerond] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.id, run.id));
  expect(afgerond!.status).toBe("bevestigd");
});

// Tegenproef op dezelfde naad: een échte parse-fout moet nog wél 'parse_fout' melden.
// Zonder deze test zou "haal alles uit de try" ook groen zijn.
test("een kapotte docx meldt nog steeds een parse-fout", async () => {
  const { db, dossier, run } = await seed();
  harnas.docxKapot = true;

  const uitkomst = await finishTableImportAction({
    dossierId: dossier.id,
    runId: run.id,
  });
  expect(uitkomst).toEqual({ error: "The file could not be parsed." });

  const afgewezen = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.entityId, run.id),
        eq(events.action, "tabel_import_rejected"),
      ),
    );
  expect(afgewezen).toHaveLength(1);
  expect((afgewezen[0]!.payload as { reden?: string }).reden).toBe("parse_fout");
});
