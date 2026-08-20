// Bronbestand-opslag (goal-import-meer-formaten): het chunk-lock (B4-patroon),
// hervatten met doneChunks, assemblage in chunk-volgorde, en de B2-harde eis dat
// alléén getSourceFile de bytes-kolom selecteert.
import { drizzle } from "drizzle-orm/pglite";
import { expect, test } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { createDossier } from "@/lib/repo/dossiers";
import {
  addSourceChunk,
  assembleSourceFile,
  getDoneChunks,
  getSourceFile,
  SOURCE_CHUNK_MAX_BYTES,
  startTableImport,
} from "@/lib/repo/source-files";

const ACTOR = "test@brinklicht.nl";

async function startRun(db: TestDb) {
  const dossier = await createDossier(db, { orgId: null, name: "Tabel-upload" });
  const { run } = await startTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.xlsx",
    actor: ACTOR,
  });
  return { dossier, run };
}

test("chunk-lock: dubbele chunk → alreadyDone, bytes blijven de eerste versie", async () => {
  const db = await createTestDb();
  const { run } = await startRun(db);

  const eerste = await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    chunk: 0,
    bytes: new Uint8Array([1, 2, 3]),
  });
  expect(eerste.alreadyDone).toBe(false);

  // idempotent hervatten: zelfde chunk nogmaals (andere bytes — mag niet winnen)
  const tweede = await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    chunk: 0,
    bytes: new Uint8Array([9, 9, 9]),
  });
  expect(tweede.alreadyDone).toBe(true);

  const file = await getSourceFile(db, run.id);
  expect(Array.from(file!.bytes)).toEqual([1, 2, 3]);
});

test("hervatten: tweede start van hetzelfde bestand geeft dezelfde run + doneChunks", async () => {
  const db = await createTestDb();
  const { dossier, run } = await startRun(db);
  await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.xlsx",
    mime: "application/octet-stream",
    chunk: 0,
    bytes: new Uint8Array([1]),
  });
  await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.xlsx",
    mime: "application/octet-stream",
    chunk: 1,
    bytes: new Uint8Array([2]),
  });

  const opnieuw = await startTableImport(db, {
    dossierId: dossier.id,
    filename: "staat.xlsx",
    actor: ACTOR,
  });
  expect(opnieuw.resumed).toBe(true);
  expect(opnieuw.run.id).toBe(run.id);
  expect(opnieuw.doneChunks).toEqual([0, 1]);

  // ander bestand → verse run
  const ander = await startTableImport(db, {
    dossierId: dossier.id,
    filename: "andere-staat.csv",
    actor: ACTOR,
  });
  expect(ander.resumed).toBe(false);
  expect(ander.run.id).not.toBe(run.id);
});

test("assemblage: chunks in volgorde aaneengesloten; gat → eerlijke fout", async () => {
  const db = await createTestDb();
  const { run } = await startRun(db);
  // bewust in omgekeerde volgorde aangeleverd
  await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.csv",
    mime: "text/csv",
    chunk: 1,
    bytes: new Uint8Array([4, 5]),
  });
  await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.csv",
    mime: "text/csv",
    chunk: 0,
    bytes: new Uint8Array([1, 2, 3]),
  });
  const file = await assembleSourceFile(db, run.id);
  expect(Array.from(file!.bytes)).toEqual([1, 2, 3, 4, 5]);
  expect(file!.chunks).toBe(2);
  expect(file!.mime).toBe("text/csv");

  // run zonder chunks → null (het >15 MB-pad slaat niets op)
  const { run: leeg } = await startTableImport(db, {
    dossierId: run.dossierId,
    filename: "leeg.xlsx",
    actor: ACTOR,
  });
  expect(await assembleSourceFile(db, leeg.id)).toBeNull();

  // gat (chunk 0 ontbreekt) → throw, nooit een half bestand een parser in
  const { run: gat } = await startTableImport(db, {
    dossierId: run.dossierId,
    filename: "gat.xlsx",
    actor: ACTOR,
  });
  await addSourceChunk(db, {
    runId: gat.id,
    filename: "gat.xlsx",
    mime: "application/octet-stream",
    chunk: 1,
    bytes: new Uint8Array([1]),
  });
  await expect(assembleSourceFile(db, gat.id)).rejects.toThrow(/ontbreekt/);
});

test("grenzen: chunk buiten 0..7 en chunks > 2 MB worden geweigerd", async () => {
  const db = await createTestDb();
  const { run } = await startRun(db);
  const klein = new Uint8Array([1]);
  await expect(
    addSourceChunk(db, { runId: run.id, filename: "x", mime: "m", chunk: 8, bytes: klein }),
  ).rejects.toThrow(/buiten bereik/);
  await expect(
    addSourceChunk(db, { runId: run.id, filename: "x", mime: "m", chunk: -1, bytes: klein }),
  ).rejects.toThrow(/buiten bereik/);
  await expect(
    addSourceChunk(db, {
      runId: run.id,
      filename: "x",
      mime: "m",
      chunk: 0,
      bytes: new Uint8Array(SOURCE_CHUNK_MAX_BYTES + 1),
    }),
  ).rejects.toThrow(/2 MB/);
});

// ── B2: alléén getSourceFile raakt de bytes-kolom ────────────────────────────
test("start/hervatten/doneChunks selecteren de bytes-kolom nooit; getSourceFile wél", async () => {
  const db = await createTestDb();
  const { dossier, run } = await startRun(db);
  await addSourceChunk(db, {
    runId: run.id,
    filename: "staat.xlsx",
    mime: "application/octet-stream",
    chunk: 0,
    bytes: new Uint8Array([7, 8]),
  });

  const queries: string[] = [];
  const spyDb = drizzle(db.$client, {
    schema,
    logger: { logQuery: (q: string) => void queries.push(q) },
  }) as TestDb;

  await getDoneChunks(spyDb, run.id);
  await startTableImport(spyDb, {
    dossierId: dossier.id,
    filename: "staat.xlsx",
    actor: ACTOR,
  });
  expect(queries.length).toBeGreaterThan(0);
  for (const q of queries) expect(q).not.toContain('"bytes"');

  queries.length = 0;
  const file = await getSourceFile(spyDb, run.id);
  expect(queries.some((q) => q.includes('"bytes"'))).toBe(true);
  expect(Array.from(file!.bytes)).toEqual([7, 8]);
});
