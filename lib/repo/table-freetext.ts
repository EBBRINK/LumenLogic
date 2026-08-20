// Docx-vrije-tekst-fallback van de tabel-import (goal-import-meer-formaten).
//
// Een docx MET tabellen gaat deterministisch (lib/table/rows-from-docx.ts →
// parseSpecLinesFromRows, €0). Dit bestand is het enige AI-pad van de tabel-import:
// een docx ZONDER tabellen heeft alleen lopende tekst, en die gaat per ~40 rijen
// door de rij-variant van de leesroute (leesrouteRijenBatch, Bouwer B — zelfde
// budget-/eventafspraken als de paginaroute; '=== ROW N ==='-markers).
//
// De uitkomst blijft een gewone tabel-import: recordTableImport zet élke regel
// zonder matcher-review op de verplichte 'tabel'-review, en sourcePage = het
// rijnummer (regelnummer in de lopende tekst) — "Read from row N" klopt dus ook
// hier. Ijzeren regel 2 blijft geborgd: de leesroute ziet alleen de teksten,
// nooit prijzen, en de matcher blijft LLM-vrij.
import {
  LEESROUTE_BATCH_RIJEN,
  leesrouteRijenBatch,
  type LeesrouteRij,
} from "@/lib/ai/leesroute";
import type { OcrClient } from "@/lib/ai/ocr";
import { MARKDOWN_CAP } from "@/lib/pdf/armaturenboek";
import type { SpecLineInput } from "@/lib/repo/dossiers";
import { recordTableImport } from "@/lib/repo/imports";
import { regelToSpecLine } from "@/lib/repo/ocr";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type DocxFreeTextResult = {
  run: Awaited<ReturnType<typeof recordTableImport>>["run"];
  created: Awaited<ReturnType<typeof recordTableImport>>["created"];
  batches: number;
  costEur: number;
  gestopt: "budget_run" | "budget_month" | "no_key" | null;
};

export async function recordDocxFreeTextImport(
  db: AppDb,
  input: {
    dossierId: string;
    runId: string; // de bestaande 'tabel'-run van startTableImport
    filename?: string | null;
    freeText: string;
    brandNames: string[];
    client?: OcrClient;
    actor?: string;
  },
): Promise<DocxFreeTextResult> {
  // Regelnummer = rijnummer, over ÁLLE regels geteld (lege regels schuiven de
  // nummering niet op — "Read from row N" moet kloppen met het bronbestand).
  const rijen: LeesrouteRij[] = input.freeText
    .split(/\r?\n/)
    .map((text, i) => ({ rowNumber: i + 1, text }))
    .filter((r) => r.text.trim() !== "");

  const lines: SpecLineInput[] = [];
  const seen = new Set<string>();
  let batches = 0;
  let costEur = 0;
  let gestopt: DocxFreeTextResult["gestopt"] = null;

  for (let i = 0; i < rijen.length; i += LEESROUTE_BATCH_RIJEN) {
    const batch = rijen.slice(i, i + LEESROUTE_BATCH_RIJEN);
    const result = await leesrouteRijenBatch(db, {
      importRunId: input.runId,
      rows: batch,
      client: input.client,
      actor: input.actor,
    });
    // Skip = stoppen (zelfde redenering als recordLeesrouteImport): zonder key komt
    // er binnen deze aanroep niets meer, en een budgetplafond faalt ook voor elke
    // volgende batch. Wat al gelezen is blijft staan; het event maakt de stop
    // zichtbaar (regel 5, nooit stil).
    if ("skipped" in result) {
      gestopt = result.skipped;
      await logEvent(db, {
        entity: "import_run",
        entityId: input.runId,
        action:
          result.skipped === "no_key"
            ? "leesroute_skipped_no_key"
            : "leesroute_skipped_budget",
        actor: input.actor,
        payload: { reden: result.skipped, route: "docx_vrije_tekst" },
      });
      break;
    }
    // Gefaalde batch: het failed-event is al gelogd door leesrouteRijenBatch —
    // door met de rest.
    if ("failed" in result) continue;

    batches++;
    costEur += result.costEur;
    for (const regel of result.regels) {
      // Zelfde mapping als de OCR/leesroute (merk-knip, spec-parse over
      // ruweTekst+type, artikelnummer-als-code) — de routes lopen nooit uiteen.
      const line = regelToSpecLine(regel, regel.rij, input.runId, input.brandNames);
      if (seen.has(line.fixtureCode)) continue; // eerste lezing wint (zoals de parsers)
      seen.add(line.fixtureCode);
      lines.push({ ...line, source: "tabel" });
    }
  }

  // De run afronden zoals elke tabel-import: regels + matcher + verplichte review,
  // met de volledige lopende tekst als controlespoor (cap ~2 MB, zoals PDF).
  const md =
    input.freeText.length <= MARKDOWN_CAP
      ? input.freeText
      : `${input.freeText.slice(0, MARKDOWN_CAP)}\n\n> truncated at 2 MB`;
  const { run, created } = await recordTableImport(db, {
    dossierId: input.dossierId,
    filename: input.filename,
    lines,
    rawMarkdown: md,
    existingRunId: input.runId,
    actor: input.actor,
  });
  return { run, created, batches, costEur, gestopt };
}
