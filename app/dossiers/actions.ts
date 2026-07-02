"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import {
  addSpecLines,
  createDossier,
  deleteSpecLine,
  generateQuote,
  markNoMatch,
  matchSpecLine,
  parseSpecCsv,
  setDossierPhase,
} from "@/lib/repo/dossiers";
import { extractSpecLinesFromPdf } from "@/lib/pdf/armaturenboek";
import { logEvent } from "@/lib/repo/events";
import { requireSession, getActor } from "@/lib/session";

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

export async function createDossierAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const phase = formData.get("phase") === "awarded" ? "awarded" : "tender";
  const dossier = await createDossier(db, {
    name,
    customer: strOrNull(formData.get("customer")),
    phase,
    actor: await getActor(),
  });
  redirect(`/dossiers/${dossier.id}`);
}

export async function addSpecLineAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const fixtureCode = String(formData.get("fixtureCode") ?? "").trim();
  if (!dossierId || !fixtureCode) return;
  await addSpecLines(db, dossierId, [
    {
      fixtureCode,
      quantity: intOrNull(formData.get("quantity")) ?? 1,
      brandText: strOrNull(formData.get("brandText")),
      productText: strOrNull(formData.get("productText")),
      reqKelvin: intOrNull(formData.get("reqKelvin")),
      reqCri: intOrNull(formData.get("reqCri")),
      reqIp: strOrNull(formData.get("reqIp")),
    },
  ]);
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function addSpecCsvAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const csv = String(formData.get("csv") ?? "");
  const lines = parseSpecCsv(csv);
  if (dossierId && lines.length) await addSpecLines(db, dossierId, lines);
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function importArmaturenboekPdfAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const file = formData.get("pdf");
  if (!dossierId || !(file instanceof File) || file.size === 0) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);
  const { lines, hadText } = await extractSpecLinesFromPdf(bytes, brandNames);
  if (lines.length) await addSpecLines(db, dossierId, lines);
  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "pdf_import",
    actor: await getActor(),
    payload: { file: file.name, hadText, imported: lines.length },
  });
  revalidatePath(`/dossiers/${dossierId}`);
  redirect(
    `/dossiers/${dossierId}?pdf=${hadText ? String(lines.length) : "geen-tekstlaag"}`,
  );
}

export async function matchAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const productId = String(formData.get("productId"));
  if (specLineId && productId)
    await matchSpecLine(db, specLineId, productId, await getActor());
  redirect(`/dossiers/${dossierId}`);
}

export async function noMatchAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  if (specLineId) await markNoMatch(db, specLineId, await getActor());
  redirect(`/dossiers/${dossierId}`);
}

export async function deleteLineAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  if (specLineId) await deleteSpecLine(db, specLineId);
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function generateQuoteAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  if (dossierId) await generateQuote(db, dossierId, await getActor());
  redirect(`/dossiers/${dossierId}/offerte`);
}

export async function setPhaseAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const phase = formData.get("phase") === "awarded" ? "awarded" : "tender";
  if (dossierId) await setDossierPhase(db, dossierId, phase, await getActor());
  revalidatePath(`/dossiers/${dossierId}`);
}
