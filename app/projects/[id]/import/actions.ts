"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { ImportRow } from "@/db/schema";
import { parseSpecCsv } from "@/lib/repo/dossiers";
import {
  cancelImportRun,
  confirmImportRun,
  createImportRun,
} from "@/lib/repo/imports";
import { getActor } from "@/lib/session";
import { bewaakProject } from "@/lib/project-poort";

// Grens waarboven een geplakt CSV-blok niet direct wordt toegevoegd, maar eerst als
// voorstel-scherm langskomt (B-06): een grote plak verdient een controle-tik.
const CSV_PROPOSAL_THRESHOLD = 10;

// Aangevinkte rijen uit de FormData halen: elke checkbox heet `row-<index>` en verschijnt
// alleen in de payload als hij aangevinkt is (uitgevinkte checkboxes sturen niets).
function checkedIndicesFrom(formData: FormData): number[] {
  const indices: number[] = [];
  for (const key of formData.keys()) {
    const m = /^row-(\d+)$/.exec(key);
    if (m) indices.push(Number(m[1]));
  }
  return indices;
}

// Bevestigen: maak spec_lines van de aangevinkte rows en draai de matcher (in de repo-laag).
export async function confirmImportAction(formData: FormData) {
  const { scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  const runId = String(formData.get("runId"));
  if (runId) {
    await confirmImportRun(db, runId, checkedIndicesFrom(formData), await getActor());
  }
  redirect(`/projects/${dossierId}`);
}

// Annuleren: run op 'geannuleerd', geen enkele regel ontstaat.
export async function cancelImportAction(formData: FormData) {
  const { scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  const runId = String(formData.get("runId"));
  if (runId) await cancelImportRun(db, runId, await getActor());
  redirect(`/projects/${dossierId}`);
}

// Groot CSV-blok (>10 regels) → géén directe toevoeging, maar een voorstel-run + het
// controle-scherm. Kleinere plak-flows blijven bij addSpecCsvAction (directe toevoeging).
export async function createCsvProposalAction(formData: FormData) {
  const { scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  const csv = String(formData.get("csv") ?? "");
  const parsed = parseSpecCsv(csv);
  if (!dossierId || parsed.length <= CSV_PROPOSAL_THRESHOLD) {
    // te klein voor een voorstel-scherm → terug naar het dossier (regels-tab handelt af)
    redirect(`/projects/${dossierId}`);
  }
  const rows: ImportRow[] = parsed.map((l) => ({
    fixtureCode: l.fixtureCode,
    quantity: l.quantity ?? null,
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    zone: l.zone ?? null,
    source: "csv",
    checked: true, // CSV is betrouwbaar → standaard aangevinkt (mens kan uitvinken)
  }));
  const run = await createImportRun(db, {
    dossierId,
    source: "csv",
    confidence: "hoog",
    rows,
    actor: await getActor(),
  });
  redirect(`/projects/${dossierId}/import/${run.id}`);
}
