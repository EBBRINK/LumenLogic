// Docx-vrije-tekst-fallback (goal-import-meer-formaten): de rij-leesroute van
// Bouwer B, georkestreerd tot een gewone tabel-import — regels op rijnummer,
// verplichte 'tabel'-review, en een eerlijke stop zonder key.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { events, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import type { OcrClient, OcrMessageParams, OcrResponse } from "@/lib/ai/ocr";
import { createDossier } from "@/lib/repo/dossiers";
import { startTableImport } from "@/lib/repo/source-files";
import { recordDocxFreeTextImport } from "@/lib/repo/table-freetext";

const ACTOR = "test@brinklicht.nl";
const USAGE = { input_tokens: 2000, output_tokens: 300 };

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

async function wereld(db: TestDb) {
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "310.00",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, { orgId: null, name: "Docx vrije tekst" });
  const { run } = await startTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.docx",
    actor: ACTOR,
  });
  return { dossier, run };
}

const FREE_TEXT =
  "Armaturenstaat gebouw B\n" +
  "Lp301 XAL SASSO 100, 12 stuks, 3000 K\n" +
  "\n" +
  "boven de balie een ronde pendelreeks, aangeduid als L004";

test("vrije tekst → rij-leesroute → tabel-import met rijnummers en verplichte review", async () => {
  const db = await createTestDb();
  const { dossier, run: gestart } = await wereld(db);
  const { client, calls } = mockClient([
    toolResponse([
      {
        armatuurcode: "Lp301",
        merk: "XAL",
        type: "SASSO 100",
        ruwe_tekst: "Lp301 XAL SASSO 100, 12 stuks, 3000 K",
        rij: 2, // regelnummer in de lopende tekst — lege regels schuiven niet op
      },
      {
        armatuurcode: "L004",
        merk: null,
        type: "ronde pendelreeks",
        ruwe_tekst: "boven de balie een ronde pendelreeks, aangeduid als L004",
        rij: 4,
      },
    ]),
  ]);

  const result = await recordDocxFreeTextImport(db, {
    dossierId: dossier.id,
    runId: gestart.id,
    filename: "staat.docx",
    freeText: FREE_TEXT,
    brandNames: ["XAL"],
    client,
    actor: ACTOR,
  });

  expect(calls).toHaveLength(1); // 3 niet-lege regels < 40 → één batch
  expect(result.batches).toBe(1);
  expect(result.gestopt).toBeNull();
  expect(result.run.id).toBe(gestart.id);
  expect(result.run.status).toBe("bevestigd");
  expect(result.run.rawMarkdown).toBe(FREE_TEXT); // controlespoor = de lopende tekst
  expect(result.created).toHaveLength(2);

  const lines = await db
    .select()
    .from(specLines)
    .where(eq(specLines.dossierId, dossier.id));
  const lp301 = lines.find((l) => l.fixtureCode === "Lp301")!;
  const l004 = lines.find((l) => l.fixtureCode === "L004")!;
  for (const l of [lp301, l004]) {
    expect(l.source).toBe("tabel");
    expect(l.importRunId).toBe(gestart.id);
  }
  expect(lp301.sourcePage).toBe(2); // "Read from row N" klopt met het bronbestand
  expect(l004.sourcePage).toBe(4);
  expect(lp301.reqKelvin).toBe(3000); // specs deterministisch uit de ruwe tekst
  // beide zonder matcher-review → verplichte 'tabel'-review
  expect(l004.reviewKind).toBe("tabel");
});

test("zonder key: eerlijke stop mét skip-event, run rond af zonder regels", async () => {
  const db = await createTestDb();
  const { dossier, run: gestart } = await wereld(db);

  // géén client en geen env-key in de testomgeving → skip 'no_key'
  const result = await recordDocxFreeTextImport(db, {
    dossierId: dossier.id,
    runId: gestart.id,
    filename: "staat.docx",
    freeText: FREE_TEXT,
    brandNames: ["XAL"],
    actor: ACTOR,
  });
  expect(result.gestopt).toBe("no_key");
  expect(result.created).toHaveLength(0);
  expect(result.run.status).toBe("bevestigd");

  const runEvents = await db
    .select()
    .from(events)
    .where(eq(events.entityId, gestart.id));
  expect(runEvents.map((e) => e.action)).toContain("leesroute_skipped_no_key");
});
