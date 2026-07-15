// Import-voorstel-laag (functioneel ontwerp §3.5, B-06/B-07). Een import (PDF/OCR/LLM/CSV)
// landt éérst als voorstel in `import_runs` — geparste regels zijn pas spec_lines ná
// menselijke bevestiging. Zo blijft "niets stilzwijgend weglaten" waar: elke rij komt terug
// op het voorstel-scherm, de mens vinkt aan wat klopt, en OCR/LLM staat standaard uit.
import { eq } from "drizzle-orm";
import { importRuns, type ImportRow } from "@/db/schema";
import { triggerVangnet } from "@/lib/ai/vangnet";
import { addSpecLines, type SpecLineInput } from "@/lib/repo/dossiers";
import { runMatcher } from "@/lib/repo/matching";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// Alleen deze bronnen zijn een geldige spec_source (schema-enum). 'bestek' is een
// aantallen-koppeling, geen herkomst van een spec-regel → val terug op 'csv'.
const SPEC_SOURCES = new Set(["manual", "csv", "pdf", "ocr", "llm"]);
type SpecSource = "manual" | "csv" | "pdf" | "ocr" | "llm";
function toSpecSource(s: string): SpecSource {
  return SPEC_SOURCES.has(s) ? (s as SpecSource) : "csv";
}

// Een voorstel-run aanmaken (status 'voorstel'). Niets wordt nog een spec-regel; de rows
// blijven als jsonb-snapshot bewaard tot de mens bevestigt.
export async function createImportRun(
  db: AppDb,
  input: {
    dossierId: string;
    source: string; // 'pdf' | 'ocr' | 'llm' | 'csv' | 'bestek'
    filename?: string | null;
    rows: ImportRow[];
    confidence?: string | null; // 'hoog' | 'middel' | 'laag'
    actor?: string;
  },
) {
  const rows = input.rows ?? [];
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: input.dossierId,
      source: input.source,
      filename: input.filename ?? null,
      confidence: input.confidence ?? null,
      status: "voorstel",
      rows,
      counts: {
        total: rows.length,
        checked: rows.filter((r) => r.checked).length,
      },
      actor: input.actor ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "import_run_created",
    actor: input.actor,
    payload: {
      runId: run.id,
      source: input.source,
      rows: rows.length,
    },
  });
  return run;
}

// B2/stap 5: een PDF-import is géén voorstel — de regels zijn deterministisch geparst en
// gaan direct het dossier in (bestaand gedrag). De run bestaat als vaste plek voor het
// controlespoor: rows-snapshot, counts, bestandsnaam en de volledige tekstlaag als
// markdown (`raw_markdown`, cap ~2 MB). Status direct 'bevestigd'; de CSV-voorstel-flow
// (createImportRun + confirmImportRun) blijft ongewijzigd.
export async function recordPdfImport(
  db: AppDb,
  input: {
    dossierId: string;
    filename?: string | null;
    lines: SpecLineInput[];
    rawMarkdown: string;
    actor?: string;
  },
) {
  const rows: ImportRow[] = input.lines.map((l) => ({
    fixtureCode: l.fixtureCode,
    quantity: l.quantity ?? null,
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    zone: l.zone ?? null,
    specs: {
      ...(l.reqKelvin != null ? { kelvin: l.reqKelvin } : {}),
      ...(l.reqCri != null ? { cri: l.reqCri } : {}),
      ...(l.reqIp != null ? { ip: l.reqIp } : {}),
      ...(l.reqWatt != null ? { watt: l.reqWatt } : {}),
      ...(l.reqLumen != null ? { lumen: l.reqLumen } : {}),
      ...(l.reqBeamAngle != null ? { beamAngle: l.reqBeamAngle } : {}),
      ...(l.reqDimmable != null ? { dimmable: l.reqDimmable } : {}),
    },
    source: "pdf",
    checked: true, // deterministisch geparst → alles telt als bevestigd
  }));

  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: input.dossierId,
      source: "pdf",
      filename: input.filename ?? null,
      status: "bevestigd",
      rows,
      counts: { total: rows.length, checked: rows.length },
      rawMarkdown: input.rawMarkdown,
      actor: input.actor ?? null,
    })
    .returning();

  const created = input.lines.length
    ? await addSpecLines(
        db,
        input.dossierId,
        input.lines.map((l) => ({
          ...l,
          source: "pdf" as const,
          importRunId: run.id,
        })),
      )
    : [];
  for (const line of created) {
    await runMatcher(db, line.id, input.actor);
  }

  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "import_run_created",
    actor: input.actor,
    payload: {
      runId: run.id,
      source: "pdf",
      rows: rows.length,
      status: "bevestigd",
    },
  });

  // AI-vangnet (stap 8): tweede pass over de restregels. In een Next-request draait het
  // via after() ná de response (import blokkeert er niet meer op); in tests/scripts
  // awaited met vangrails — fouten worden een ai_vangnet_failed-event, zonder key een
  // skip-event; de import faalt er nooit door.
  await triggerVangnet(db, input.dossierId, input.actor);

  return { run, created };
}

export async function getImportRun(db: AppDb, runId: string) {
  const [row] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.id, runId))
    .limit(1);
  return row ?? null;
}

// Eén ImportRow → SpecLineInput. Herkomst (source/confidence/page) wordt overgenomen zodat
// de regel op het scherm blijft tonen waar hij vandaan komt (B-07).
function rowToSpecLine(
  row: ImportRow,
  runId: string,
  confidence: string | null,
): SpecLineInput {
  const s = row.specs ?? {};
  return {
    fixtureCode: row.fixtureCode,
    quantity: row.quantity ?? null,
    zone: row.zone ?? null,
    brandText: row.brandText ?? null,
    productText: row.productText ?? null,
    reqKelvin: s.kelvin ?? null,
    reqCri: s.cri ?? null,
    reqIp: s.ip ?? null,
    reqWatt: s.watt ?? null,
    reqLumen: s.lumen ?? null,
    reqBeamAngle: s.beamAngle ?? null,
    reqSizeCm: s.sizeCm ?? null,
    reqShape: s.shape ?? null,
    reqColor: s.color ?? null,
    reqDimmable: s.dimmable ?? null,
    source: toSpecSource(row.source),
    sourceConfidence: confidence,
    sourcePage: row.page ?? null,
    importRunId: runId,
  };
}

// Bevestigen: maak spec_lines van de AANGEVINKTE rows (indices in run.rows), draai de
// matcher per nieuwe regel, en zet de run op 'bevestigd'. Idempotent: een run die al
// bevestigd/geannuleerd is doet niets meer (re-run is veilig).
export async function confirmImportRun(
  db: AppDb,
  runId: string,
  checkedIndices: number[],
  actor?: string,
) {
  const run = await getImportRun(db, runId);
  if (!run) throw new Error(`import-run ${runId} niet gevonden`);
  if (run.status !== "voorstel") {
    return { created: [] as Awaited<ReturnType<typeof addSpecLines>> };
  }

  const rows = (run.rows ?? []) as ImportRow[];
  // gesorteerd + uniek + binnen bereik → aanvraagvolgorde blijft behouden (regel: nooit
  // hersorteren), dubbele aanvinkingen tellen één keer.
  const picked = [...new Set(checkedIndices)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < rows.length)
    .sort((a, b) => a - b)
    .map((i) => rows[i]);

  const inputs = picked.map((r) => rowToSpecLine(r, runId, run.confidence));
  const created = inputs.length
    ? await addSpecLines(db, run.dossierId, inputs)
    : [];

  for (const line of created) {
    await runMatcher(db, line.id, actor);
  }

  await db
    .update(importRuns)
    .set({ status: "bevestigd", actor: actor ?? run.actor, updatedAt: new Date() })
    .where(eq(importRuns.id, runId));

  await logEvent(db, {
    entity: "dossier",
    entityId: run.dossierId,
    action: "import_run_confirmed",
    actor,
    payload: { runId, added: created.length, ofRows: rows.length },
  });

  // AI-vangnet (stap 8): zelfde niet-blokkerende trigger als bij de PDF-import.
  await triggerVangnet(db, run.dossierId, actor);

  return { created };
}

// Annuleren: run op 'geannuleerd', er ontstaat geen enkele spec-regel.
export async function cancelImportRun(db: AppDb, runId: string, actor?: string) {
  const run = await getImportRun(db, runId);
  if (!run) throw new Error(`import-run ${runId} niet gevonden`);
  await db
    .update(importRuns)
    .set({ status: "geannuleerd", updatedAt: new Date() })
    .where(eq(importRuns.id, runId));
  await logEvent(db, {
    entity: "dossier",
    entityId: run.dossierId,
    action: "import_run_cancelled",
    actor,
    payload: { runId },
  });
}

export type { ImportRow };
