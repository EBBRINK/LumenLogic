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
  getDossier,
  linkQuantities,
  parseBestek,
  parseSpecCsv,
  setDayPrice,
  setQuantity,
  updateQuoteHeader,
  updateSpecLine,
} from "@/lib/repo/dossiers";
import {
  PROJECT_STATUSES,
  XIS_PHASES,
  setStatus,
  setXisPhase,
  type ProjectStatus,
  type XisPhase,
} from "@/lib/repo/project-status";
import {
  chooseCandidate,
  runMatcher,
  setLineStatus,
  unlinkMatch,
} from "@/lib/repo/matching";
import { recordPdfImport, getImportRun } from "@/lib/repo/imports";
import { finishOcrRun, processOcrPage, startOcrRun } from "@/lib/repo/ocr";
import { envApiKey } from "@/lib/ai/shared";
import { setDossierOrg } from "@/lib/repo/orgs";
import { triggerVangnet } from "@/lib/ai/vangnet";
import { dismissSuggestion, useAiSuggestion } from "@/lib/repo/ai-suggestions";
import { decideReview, flagForReview, linkManualProduct } from "@/lib/repo/review";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
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

function asXisPhase(v: FormDataEntryValue | null): XisPhase {
  return XIS_PHASES.includes(v as XisPhase) ? (v as XisPhase) : "start";
}

export async function createDossierAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  // Geen statuskeuze bij aanmaken: altijd 'concept'. Alleen de XIS-fase (default start).
  const dossier = await createDossier(db, {
    name,
    customer: strOrNull(formData.get("customer")),
    xisPhase: asXisPhase(formData.get("xisPhase")),
    actor: await getActor(),
  });
  // Optioneel: dossier aan een org koppelen (leeg = intern Brink-dossier).
  const orgId = strOrNull(formData.get("orgId"));
  if (orgId) await setDossierOrg(db, dossier.id, orgId);
  redirect(`/projects/${dossier.id}`);
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
  revalidatePath(`/projects/${dossierId}`);
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
  revalidatePath(`/projects/${dossierId}`);
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
  revalidatePath(`/projects/${dossierId}`);
}

// 413-fix: de PDF zelf komt nooit meer op de server. De upload-kaart (client component)
// extraheert de tekstlaag in de browser en stuurt alleen { filename, pages } als JSON —
// een 5,5+ MB boek blijft zo ruim onder Next's action-bodylimiet en Vercel's ~4,5 MB
// request-limiet. Cap op de totale tekst: 5 MB tekst is extreem ruim (het 5,5 MB-
// voorbeeldboek levert < 100 kB tekstlaag); alles daarboven is geen inhoudsopgave.
const PAGES_TEXT_CAP = 5 * 1024 * 1024;

export async function importArmaturenboekPagesAction(input: {
  dossierId: string;
  filename: string;
  pages: string[];
}): Promise<{ error: string } | void> {
  await requireSession();
  const actor = await getActor();
  const dossierId =
    typeof input?.dossierId === "string" ? input.dossierId.trim() : "";
  const filename =
    (typeof input?.filename === "string" ? input.filename.trim() : "").slice(
      0,
      255,
    ) || "armaturenboek.pdf";
  const pages =
    Array.isArray(input?.pages) &&
    input.pages.every((p) => typeof p === "string")
      ? input.pages
      : null;
  if (!dossierId || !pages) return { error: "Ongeldige import-aanroep." };
  const totalChars = pages.reduce((n, p) => n + p.length, 0);
  if (totalChars > PAGES_TEXT_CAP) {
    return {
      error:
        "De tekstlaag van deze PDF is groter dan 5 MB — dat kan geen armaturenboek-inhoudsopgave zijn.",
    };
  }
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);
  const { lines, hadText, markdown } = parseSpecLinesFromPages(
    pages,
    brandNames,
  );
  // B2/stap 5: de import krijgt altijd een run (status 'bevestigd') als vaste plek voor
  // het markdown-controlespoor — ook bij nul regels of een ontbrekende tekstlaag.
  const { run } = await recordPdfImport(db, {
    dossierId,
    filename,
    lines,
    rawMarkdown: markdown,
    actor,
  });
  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "pdf_import",
    actor,
    payload: { file: filename, hadText, imported: lines.length, runId: run.id },
  });
  revalidatePath(`/projects/${dossierId}`);
  redirect(
    `/projects/${dossierId}?pdf=${hadText ? String(lines.length) : "no-text-layer"}&run=${run.id}`,
  );
}

// ── OCR-import (plan-ocr-beeld-pdf, bouwstap 4/5) ────────────────────────────
// De client-loop (stap 5) rendert de beeld-PDF per pagina en stuurt elk beeld als
// FormData naar ocrPageAction; start/afronden gaan hieronder. Elk beeld past ruim
// binnen Next's action-bodylimiet (JPEG van 1568px lange zijde ≈ 200–500 kB).
const OCR_IMAGE_CAP = 2 * 1024 * 1024; // hard plafond per paginabeeld
const OCR_MAX_PAGES = 500;

// Run starten (of hervatten, B5: zelfde dossier + bestand + ocrStatus 'bezig').
// Geen key → eerlijke melding vóór er ook maar iets gerenderd of geüpload wordt.
export async function startOcrImportAction(input: {
  dossierId: string;
  filename: string;
  pageCount: number;
}): Promise<
  | { error: string }
  | { runId: string; resumed: boolean; donePages: number[] }
> {
  await requireSession();
  const actor = await getActor();
  const dossierId =
    typeof input?.dossierId === "string" ? input.dossierId.trim() : "";
  const filename =
    (typeof input?.filename === "string" ? input.filename.trim() : "").slice(
      0,
      255,
    ) || "armaturenboek.pdf";
  const pageCount = Number(input?.pageCount);
  if (!dossierId || !Number.isInteger(pageCount) || pageCount < 1) {
    return { error: "Invalid OCR request." };
  }
  if (pageCount > OCR_MAX_PAGES) {
    return { error: `This PDF has more than ${OCR_MAX_PAGES} pages.` };
  }
  if (!envApiKey()) {
    return {
      error:
        "OCR is unavailable: no AI key is configured. Add the fixture rows manually or via CSV.",
    };
  }
  if (!(await getDossier(db, dossierId))) {
    return { error: "Unknown project." };
  }
  const { run, resumed, donePages } = await startOcrRun(db, {
    dossierId,
    filename,
    pageCount,
    actor,
  });
  return { runId: run.id, resumed, donePages };
}

// Eén pagina: FormData met runId/dossierId/page/width/height + het beeld als File.
// De beeldrij-lock en het €1-plafond leven in de repo-laag (B4); hier alleen
// sessie, eigendom (run hoort bij dit dossier) en groottes.
export async function ocrPageAction(formData: FormData): Promise<
  | { error: string }
  | { alreadyDone: true }
  | { stopped: "budget" | "no_key" }
  | { failed: string }
  | { created: number; duplicates: number }
> {
  await requireSession();
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  const page = intOrNull(formData.get("page"));
  const width = intOrNull(formData.get("width"));
  const height = intOrNull(formData.get("height"));
  const image = formData.get("image");
  if (!dossierId || !runId || !page || page < 1 || !width || !height) {
    return { error: "Invalid OCR page request." };
  }
  if (!(image instanceof File) || !image.type.startsWith("image/")) {
    return { error: "No page image supplied." };
  }
  if (image.size > OCR_IMAGE_CAP) {
    return { error: "Page image is larger than 2 MB." };
  }
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== dossierId || run.source !== "ocr") {
    return { error: "Unknown OCR run for this project." };
  }
  if (run.ocrStatus !== "bezig") {
    return { error: "This OCR run is no longer active." };
  }

  const result = await processOcrPage(db, {
    runId,
    page,
    imageBytes: new Uint8Array(await image.arrayBuffer()),
    mime: image.type,
    width,
    height,
    actor,
  });
  if ("alreadyDone" in result) return { alreadyDone: true };
  if ("skipped" in result) {
    return { stopped: result.skipped === "no_key" ? "no_key" : "budget" };
  }
  if ("failed" in result) return { failed: result.failed };
  // Regels verschijnen progressief op de projectpagina terwijl de loop draait.
  revalidatePath(`/projects/${dossierId}`);
  return { created: result.created, duplicates: result.duplicates };
}

// Afronden: transcript + ocrStatus 'klaar' + ocr_done-event, daarna terug naar de
// projectpagina met ?ocr=<aantal regels>&run=<id> (zelfde patroon als ?pdf=…).
export async function finishOcrAction(formData: FormData) {
  await requireSession();
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  if (!dossierId || !runId) return { error: "Invalid OCR request." };
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== dossierId || run.source !== "ocr") {
    return { error: "Unknown OCR run for this project." };
  }
  const finished = await finishOcrRun(db, { runId, actor });
  const counts = (finished.counts ?? {}) as Record<string, number>;
  revalidatePath(`/projects/${dossierId}`);
  redirect(`/projects/${dossierId}?ocr=${counts.checked ?? 0}&run=${runId}`);
}

// Matcher (opnieuw) draaien op één regel.
export async function runMatchAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  if (specLineId) await runMatcher(db, specLineId, await getActor());
  revalidatePath(`/projects/${dossierId}`);
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
  redirect(`/projects/${dossierId}`);
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
  redirect(`/projects/${dossierId}`);
}

export async function unlinkMatchAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (specLineId && reason) await unlinkMatch(db, specLineId, reason, await getActor());
  redirect(`/projects/${dossierId}/line/${specLineId}`);
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
  redirect(`/projects/${dossierId}/line/${specLineId}`);
}

// Review-beslissing (3.7). Bevestigende keuzes dragen optioneel het gekozen productId
// ("welke van deze N", kleurvariant) — de repo maakt de regel dan groen met merkteken
// "handmatig gekozen" (herontwerp 2026-07-14).
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
      productId: strOrNull(formData.get("productId")),
      actor: await getActor(),
    });
  }
  // De beslissing verandert ook de regelstatus (groen/rood) → regels-tab en badge mee.
  revalidatePath(`/projects/${dossierId}/review`);
  revalidatePath(`/projects/${dossierId}`);
}

// Rood-kaart: handmatig een vergelijkbaar product linken (stap 7). Menshandeling —
// de gebruiker zocht zelf en klikte; het systeem suggereerde niets (ijzeren regel 4).
export async function linkManualProductAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const productId = String(formData.get("productId"));
  if (specLineId && productId) {
    await linkManualProduct(db, {
      specLineId,
      productId,
      actor: await getActor(),
    });
  }
  // redirect zonder query-string: de zoekresultaten zijn na het linken niet meer nodig.
  revalidatePath(`/projects/${dossierId}`);
  redirect(`/projects/${dossierId}/review`);
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
  revalidatePath(`/projects/${dossierId}`);
}

export async function setQuantityAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const quantity = intOrNull(formData.get("quantity"));
  if (specLineId) await setQuantity(db, specLineId, quantity, await getActor());
  revalidatePath(`/projects/${dossierId}/quote`);
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
  revalidatePath(`/projects/${dossierId}/quote`);
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
  // AI-vangnet (stap 8) na de hermatch: via after() ná de response (de edit wacht er
  // niet op); vangrails in runVangnetSafe blijven — fout → event, nooit een kapotte edit.
  await triggerVangnet(db, dossierId, actor);
  redirect(`/projects/${dossierId}/line/${specLineId}`);
}

// AI-suggestie gebruiken als handmatige keuze (B4): loopt via de bestaande flow
// (decideReview/linkManualProduct incl. zichtbaarheids-guard); de suggestie wordt
// als historie gemarkeerd ('gebruikt door <actor>'). Een niet-meer-zichtbaar product
// gooit in de repo — dan blijft alles ongewijzigd (zelfde vangnet als setStatusAction).
export async function useAiSuggestionAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const suggestionId = String(formData.get("suggestionId") ?? "").trim();
  if (suggestionId) {
    try {
      await useAiSuggestion(db, { suggestionId, actor: await getActor() });
    } catch {
      // product niet (meer) zichtbaar → suggestie en regel blijven ongewijzigd
    }
  }
  revalidatePath(`/projects/${dossierId}/review`);
  revalidatePath(`/projects/${dossierId}/line/${specLineId}`);
  revalidatePath(`/projects/${dossierId}`);
}

// AI-suggestie verwerpen: dismissed_at/by + event; de regel zelf blijft onaangeroerd.
export async function dismissAiSuggestionAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const suggestionId = String(formData.get("suggestionId") ?? "").trim();
  if (suggestionId) {
    await dismissSuggestion(db, { suggestionId, actor: await getActor() });
  }
  revalidatePath(`/projects/${dossierId}/review`);
  revalidatePath(`/projects/${dossierId}/line/${specLineId}`);
  revalidatePath(`/projects/${dossierId}`);
}

export async function deleteLineAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  if (specLineId) await deleteSpecLine(db, specLineId);
  revalidatePath(`/projects/${dossierId}`);
}

export async function generateQuoteAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId"));
  if (dossierId) await generateQuote(db, dossierId, await getActor());
  redirect(`/projects/${dossierId}/quote`);
}

// B6, stap 4: statuswijziging via de ene schrijver (lib/repo/project-status.ts) — de
// afgeleide fase gaat in dezelfde update mee. Archief zonder reden wordt serverside
// geweigerd; die fout vangen we hier op (de UI dwingt de reden al af — dit is het vangnet).
export async function setStatusAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const status = formData.get("status");
  if (!dossierId || !PROJECT_STATUSES.includes(status as ProjectStatus)) return;
  try {
    await setStatus(db, dossierId, status as ProjectStatus, await getActor(), {
      reason: strOrNull(formData.get("reason")),
    });
  } catch {
    // Reden verplicht bij archiveren → geen crash, project blijft ongewijzigd.
  }
  revalidatePath(`/projects/${dossierId}`);
  revalidatePath("/projects");
}

export async function setXisPhaseAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const xisPhase = formData.get("xisPhase");
  if (!dossierId || !XIS_PHASES.includes(xisPhase as XisPhase)) return;
  await setXisPhase(db, dossierId, xisPhase as XisPhase, await getActor());
  revalidatePath(`/projects/${dossierId}`);
  revalidatePath("/projects");
}
