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
  linkQuantities,
  parseBestek,
  parseSpecCsv,
  setDayPrice,
  setDossierPhase,
  setQuantity,
  updateQuoteHeader,
  updateSpecLine,
} from "@/lib/repo/dossiers";
import {
  chooseCandidate,
  runMatcher,
  setLineStatus,
  unlinkMatch,
} from "@/lib/repo/matching";
import { setDossierOrg } from "@/lib/repo/orgs";
import { decideReview, flagForReview } from "@/lib/repo/review";
import { extractSpecLinesFromPdf } from "@/lib/pdf/armaturenboek";
import { logEvent } from "@/lib/repo/events";
import { requireSession, getActor } from "@/lib/session";

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(",", "."));
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
  // Optioneel: dossier aan een org koppelen (leeg = intern Brink-dossier).
  const orgId = strOrNull(formData.get("orgId"));
  if (orgId) await setDossierOrg(db, dossier.id, orgId);
  redirect(`/dossiers/${dossier.id}`);
}

// Handmatige regel toevoegen → matcher draait direct (functioneel ontwerp 3.4-5).
export async function addSpecLineAction(formData: FormData) {
  await requireSession();
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId"));
  const fixtureCode = String(formData.get("fixtureCode") ?? "").trim();
  if (!dossierId || !fixtureCode) return;
  const [row] = await addSpecLines(db, dossierId, [
    {
      fixtureCode,
      quantity: intOrNull(formData.get("quantity")),
      zone: strOrNull(formData.get("zone")),
      brandText: strOrNull(formData.get("brandText")),
      productText: strOrNull(formData.get("productText")),
      reqKelvin: intOrNull(formData.get("reqKelvin")),
      reqCri: intOrNull(formData.get("reqCri")),
      reqIp: strOrNull(formData.get("reqIp")),
      reqWatt: numOrNull(formData.get("reqWatt")),
      reqLumen: intOrNull(formData.get("reqLumen")),
      reqBeamAngle: numOrNull(formData.get("reqBeamAngle")),
      reqSizeCm: numOrNull(formData.get("reqSizeCm")),
      reqShape: strOrNull(formData.get("reqShape")),
      reqColor: strOrNull(formData.get("reqColor")),
      reqDimmable: strOrNull(formData.get("reqDimmable")),
      source: "manual",
    },
  ]);
  if (row) await runMatcher(db, row.id, actor);
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function addSpecCsvAction(formData: FormData) {
  await requireSession();
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId"));
  const csv = String(formData.get("csv") ?? "");
  const lines = parseSpecCsv(csv).map((l) => ({ ...l, source: "csv" as const }));
  if (dossierId && lines.length) {
    const rows = await addSpecLines(db, dossierId, lines);
    for (const r of rows) await runMatcher(db, r.id, actor);
  }
  revalidatePath(`/dossiers/${dossierId}`);
}

// Bestek/telstaat plakken → aantallen koppelen op fixture-code (B-08/A-06).
export async function linkBestekAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const block = String(formData.get("bestek") ?? "");
  const pairs = parseBestek(block);
  if (dossierId && pairs.length) {
    await linkQuantities(db, dossierId, pairs, await getActor());
  }
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function importArmaturenboekPdfAction(formData: FormData) {
  await requireSession();
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId"));
  const file = formData.get("pdf");
  if (!dossierId || !(file instanceof File) || file.size === 0) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);
  const { lines, hadText } = await extractSpecLinesFromPdf(bytes, brandNames);
  if (lines.length) {
    const rows = await addSpecLines(
      db,
      dossierId,
      lines.map((l) => ({ ...l, source: "pdf" as const })),
    );
    for (const r of rows) await runMatcher(db, r.id, actor);
  }
  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "pdf_import",
    actor,
    payload: { file: file.name, hadText, imported: lines.length },
  });
  revalidatePath(`/dossiers/${dossierId}`);
  redirect(
    `/dossiers/${dossierId}?pdf=${hadText ? String(lines.length) : "geen-tekstlaag"}`,
  );
}

// Matcher (opnieuw) draaien op één regel.
export async function runMatchAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  if (specLineId) await runMatcher(db, specLineId, await getActor());
  revalidatePath(`/dossiers/${dossierId}`);
}

// Kandidaat kiezen (regel-detail 3.6). Uit lijst 2 is een reden verplicht.
export async function chooseCandidateAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const productId = String(formData.get("productId"));
  const fromList =
    formData.get("fromList") === "onvolledig" ? "onvolledig" : "aantoonbaar";
  const reason = strOrNull(formData.get("reason"));
  if (specLineId && productId) {
    await chooseCandidate(db, {
      specLineId,
      productId,
      fromList,
      reason,
      actor: await getActor(),
    });
  }
  redirect(`/dossiers/${dossierId}`);
}

// Rood/paars/blauw handmatig zetten (regel-detailknoppen).
export async function setLineStatusAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const status = String(formData.get("status"));
  if (specLineId && (status === "rood" || status === "paars" || status === "blauw")) {
    await setLineStatus(db, {
      specLineId,
      status,
      reason: strOrNull(formData.get("reason")),
      brandText: strOrNull(formData.get("brandText")),
      actor: await getActor(),
    });
  }
  redirect(`/dossiers/${dossierId}`);
}

export async function unlinkMatchAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (specLineId && reason) await unlinkMatch(db, specLineId, reason, await getActor());
  redirect(`/dossiers/${dossierId}/regel/${specLineId}`);
}

// Dagprijs op de regel (I-04).
export async function setDayPriceAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const price = numOrNull(formData.get("price"));
  if (specLineId && price != null) {
    await setDayPrice(db, {
      specLineId,
      price,
      validUntil: strOrNull(formData.get("validUntil")),
      actor: await getActor(),
    });
  }
  redirect(`/dossiers/${dossierId}/regel/${specLineId}`);
}

// Review-beslissing (3.7).
export async function decideReviewAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const decision = String(formData.get("decision")) as
    | "accepteer"
    | "afgewezen"
    | "variant"
    | "gecontroleerd"
    | "bevestigd";
  if (specLineId) {
    await decideReview(db, {
      specLineId,
      decision,
      reason: strOrNull(formData.get("reason")),
      variantColor: strOrNull(formData.get("variantColor")),
      actor: await getActor(),
    });
  }
  revalidatePath(`/dossiers/${dossierId}/review`);
}

// Een regel handmatig in de review-wachtrij zetten (bv. variantkeuze).
export async function flagReviewAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const kind = String(formData.get("kind")) as
    | "geel"
    | "variant"
    | "onvolledig"
    | "ocr";
  if (specLineId) await flagForReview(db, specLineId, kind);
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function setQuantityAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const quantity = intOrNull(formData.get("quantity"));
  if (specLineId) await setQuantity(db, specLineId, quantity, await getActor());
  revalidatePath(`/dossiers/${dossierId}/offerte`);
}

// A-10: kopblok van de estimate opslaan (bewerkbaar tot uitsturen).
export async function saveQuoteHeaderAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  if (dossierId) {
    await updateQuoteHeader(
      db,
      dossierId,
      {
        quoteNumber: strOrNull(formData.get("quoteNumber")),
        customer: strOrNull(formData.get("customer")),
        contactName: strOrNull(formData.get("contactName")),
        address: strOrNull(formData.get("address")),
        projectRef: strOrNull(formData.get("projectRef")),
        authorEmail: strOrNull(formData.get("authorEmail")),
        quoteDate: strOrNull(formData.get("quoteDate")),
        validUntil: strOrNull(formData.get("validUntil")),
      },
      await getActor(),
    );
  }
  revalidatePath(`/dossiers/${dossierId}/offerte`);
}

// B-10: een spec-regel bewerken → daarna de matcher opnieuw draaien.
export async function editSpecLineAction(formData: FormData) {
  await requireSession();
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const fixtureCode = String(formData.get("fixtureCode") ?? "").trim();
  if (!specLineId || !fixtureCode) return;
  await updateSpecLine(
    db,
    specLineId,
    {
      fixtureCode,
      quantity: intOrNull(formData.get("quantity")),
      zone: strOrNull(formData.get("zone")),
      brandText: strOrNull(formData.get("brandText")),
      productText: strOrNull(formData.get("productText")),
      reqKelvin: intOrNull(formData.get("reqKelvin")),
      reqCri: intOrNull(formData.get("reqCri")),
      reqIp: strOrNull(formData.get("reqIp")),
      reqWatt: numOrNull(formData.get("reqWatt")),
      reqLumen: intOrNull(formData.get("reqLumen")),
      reqBeamAngle: numOrNull(formData.get("reqBeamAngle")),
      reqSizeCm: numOrNull(formData.get("reqSizeCm")),
      reqShape: strOrNull(formData.get("reqShape")),
      reqColor: strOrNull(formData.get("reqColor")),
      reqDimmable: strOrNull(formData.get("reqDimmable")),
    },
    actor,
  );
  // merk/type/specs kunnen de match veranderen → opnieuw matchen
  await runMatcher(db, specLineId, actor);
  redirect(`/dossiers/${dossierId}/regel/${specLineId}`);
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
