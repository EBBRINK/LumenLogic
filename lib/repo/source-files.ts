// Bronbestand-opslag van de tabel-import (goal-import-meer-formaten, Bouwer A stap 3).
//
// Transport is gechunkt (start → chunk → finish, het B4-lockpatroon uit de OCR-flow):
// één FormData-call van 4 MB zou de Vercel-request-limiet (~4,5 MB) raken, dus de
// client stuurt à max 2 MB per chunk, max 8 chunks (15 MB totaal — daarboven wordt
// het bestand niet opgeslagen, zie de finish-action).
//
// Harde regels:
//   • B4-lock: unique(import_run_id, chunk) — addSourceChunk insert met
//     onConflictDoNothing; conflict = chunk al binnen → {alreadyDone}, idempotent
//     hervatten kost niets en kan nooit dubbel opslaan.
//   • B2-regel (zoals getOcrPageImage): alléén getSourceFile selecteert de
//     bytes-kolom. Alle andere queries (voortgang, resume) noemen die kolom nooit —
//     anders sleept elke voortgangscheck megabytes bestand mee. PGlite-test bewijst dit.
//   • Regel 5: start/hervatten krijgen elk hun event; source_file_stored logt de
//     finish-action (éénmaal per bestand, niet per chunk).
import { and, asc, eq } from "drizzle-orm";
import { importRuns, importSourceFiles } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// Vastgeklikte limieten (interface-afspraak, beide bouwers): 15 MB totaal,
// 2 MB per chunk, max 8 chunks.
export const SOURCE_CHUNK_MAX_BYTES = 2 * 1024 * 1024;
export const SOURCE_MAX_CHUNKS = 8;
export const SOURCE_FILE_MAX_BYTES = 15 * 1024 * 1024;

// Run starten of hervatten. Eén lopende tabel-upload per dossier+bestand: bestaat er
// al een 'tabel'-run in status 'voorstel' voor precies dit bestand, dan is dit een
// hervatting (tab dichtgeklapt halverwege de chunks) en geven we die run terug met de
// al-binnengekomen chunk-nummers. 'voorstel' is hier "upload loopt nog": de finish
// zet hem op 'bevestigd' (en dat is meteen de idempotentie-poort van de finish,
// zelfde constructie als confirmImportRun).
export async function startTableImport(
  db: AppDb,
  input: { dossierId: string; filename: string; actor?: string },
) {
  const [existing] = await db
    .select()
    .from(importRuns)
    .where(
      and(
        eq(importRuns.dossierId, input.dossierId),
        eq(importRuns.source, "tabel"),
        eq(importRuns.filename, input.filename),
        eq(importRuns.status, "voorstel"),
      ),
    )
    .limit(1);
  if (existing) {
    const doneChunks = await getDoneChunks(db, existing.id);
    await logEvent(db, {
      entity: "import_run",
      entityId: existing.id,
      action: "tabel_upload_resumed",
      actor: input.actor,
      payload: { filename: input.filename, chunksDone: doneChunks.length },
    });
    return { run: existing, resumed: true as const, doneChunks };
  }

  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: input.dossierId,
      source: "tabel",
      filename: input.filename,
      status: "voorstel", // upload loopt; finish zet 'bevestigd'
      rows: [],
      counts: { total: 0, checked: 0 },
      actor: input.actor ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "import_run",
    entityId: run.id,
    action: "tabel_upload_started",
    actor: input.actor,
    payload: { dossierId: input.dossierId, filename: input.filename },
  });
  return { run, resumed: false as const, doneChunks: [] as number[] };
}

// Welke chunk-nummers al binnen zijn — bewust ZONDER de bytes-kolom (B2).
export async function getDoneChunks(db: AppDb, runId: string): Promise<number[]> {
  const rows = await db
    .select({ chunk: importSourceFiles.chunk })
    .from(importSourceFiles)
    .where(eq(importSourceFiles.importRunId, runId))
    .orderBy(asc(importSourceFiles.chunk));
  return rows.map((r) => r.chunk);
}

// Eén chunk opslaan. Het B4-lock: de unique(run, chunk)-index vangt de dubbele
// verzending — onConflictDoNothing levert dan geen rij en we melden {alreadyDone}.
// De maatvoering (chunk 0..7, bytes ≤ 2 MB) is hier een invariant en geen
// vormcontrole: te grote chunks zouden de 15 MB-som én de Vercel-limiet omzeilen.
export async function addSourceChunk(
  db: AppDb,
  input: {
    runId: string;
    filename: string;
    mime: string;
    chunk: number;
    bytes: Uint8Array;
  },
): Promise<{ alreadyDone: boolean }> {
  if (
    !Number.isInteger(input.chunk) ||
    input.chunk < 0 ||
    input.chunk >= SOURCE_MAX_CHUNKS
  ) {
    throw new Error(`chunk ${input.chunk} buiten bereik 0..${SOURCE_MAX_CHUNKS - 1}`);
  }
  if (input.bytes.length === 0 || input.bytes.length > SOURCE_CHUNK_MAX_BYTES) {
    throw new Error("chunk is leeg of groter dan 2 MB");
  }
  const inserted = await db
    .insert(importSourceFiles)
    .values({
      importRunId: input.runId,
      filename: input.filename,
      mime: input.mime,
      size: input.bytes.length,
      chunk: input.chunk,
      bytes: input.bytes,
    })
    .onConflictDoNothing()
    .returning({ id: importSourceFiles.id });
  return { alreadyDone: inserted.length === 0 };
}

export type AssembledSourceFile = {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  chunks: number;
};

// B2: de ENIGE query in de codebase die import_source_files.bytes selecteert.
export async function getSourceFile(
  db: AppDb,
  runId: string,
): Promise<AssembledSourceFile | null> {
  const rows = await db
    .select()
    .from(importSourceFiles)
    .where(eq(importSourceFiles.importRunId, runId))
    .orderBy(asc(importSourceFiles.chunk));
  if (rows.length === 0) return null;
  // aaneengesloten 0..n-1, anders is het bestand niet compleet — eerlijk falen,
  // nooit een half bestand een parser in sturen
  rows.forEach((r, i) => {
    if (r.chunk !== i) throw new Error(`chunk ${i} ontbreekt (gevonden: ${r.chunk})`);
  });
  const total = rows.reduce((n, r) => n + r.bytes.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const r of rows) {
    bytes.set(r.bytes, offset);
    offset += r.bytes.length;
  }
  return {
    filename: rows[0].filename,
    mime: rows[0].mime,
    bytes,
    chunks: rows.length,
  };
}

// Assemblage voor de finish-action — dun laagje over getSourceFile zodat de
// B2-regel één adres houdt.
export async function assembleSourceFile(
  db: AppDb,
  runId: string,
): Promise<AssembledSourceFile | null> {
  return getSourceFile(db, runId);
}
