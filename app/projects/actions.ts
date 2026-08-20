"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
// Invoervalidatie: elke action die hier wordt aangeraakt gaat om naar een schema-parse.
// De conventie staat in docs/INVOERVALIDATIE.md.
import {
  parseForm,
  parseJson,
  z,
  zBoundedInt,
  zEnumFrom,
  zOptionalInt,
  zOptionalNumber,
  zOptionalText,
  zPrice,
  zTrimmed,
  zUuid,
} from "@/lib/validation";
import { isUuid } from "@/lib/uuid";
import {
  addSpecLines,
  createDossier,
  deleteSpecLine,
  generateQuote,
  getDossier,
  linkQuantities,
  parseBestek,
  parseSpecCsv,
  SPEC_CSV_MAX_LINES,
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
import { recordPdfImport, recordTableImport, getImportRun } from "@/lib/repo/imports";
import {
  finishOcrRun,
  processOcrPage,
  startOcrRun,
} from "@/lib/repo/ocr";
import { isJpegImage, isPngImage, isZipContainer } from "@/lib/bytes/magic";
import {
  addSourceChunk,
  assembleSourceFile,
  startTableImport,
  SOURCE_CHUNK_MAX_BYTES,
  SOURCE_FILE_MAX_BYTES,
  SOURCE_MAX_CHUNKS,
} from "@/lib/repo/source-files";
import { recordDocxFreeTextImport } from "@/lib/repo/table-freetext";
import { rowsFromCsv } from "@/lib/table/rows-from-csv";
import { rowsFromDocx } from "@/lib/table/rows-from-docx";
import { sheetsFromXlsx } from "@/lib/table/rows-from-xlsx";
import {
  chooseSheet,
  isChoosableSheet,
  summarizeSheets,
  MAX_SHEETS,
  type SheetChoice,
  type SheetOption,
  type SheetSummary,
} from "@/lib/table/sheet-choice";
import {
  parseSpecLinesFromRows,
  rowsToMarkdown,
  type TableRows,
} from "@/lib/table/parse-rows";
import { beslisRoute } from "@/lib/ai/leesroute";
import { envApiKey } from "@/lib/ai/shared";
import { recordLeesrouteImport } from "@/lib/repo/leesroute";
import { triggerVangnet } from "@/lib/ai/vangnet";
import { dismissSuggestion, useAiSuggestion } from "@/lib/repo/ai-suggestions";
import { decideReview, flagForReview, linkManualProduct } from "@/lib/repo/review";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import { logEvent } from "@/lib/repo/events";
import { getActor } from "@/lib/session";
import { bewaakProject } from "@/lib/project-poort";
import { enqueueDossierForMatching } from "@/lib/repo/matchstation";

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
  const { toegang, scope } = await bewaakProject(formData);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  // ⚠️ 3.2a — DE ORGANISATIE HOORT ER METEEN BIJ. Tot deze sprint zette createDossier()
  // géén org_id en werd hij hier achteraf optioneel gezet via het keuzelijstje; wie dat
  // leeg liet, kreeg een dossier met `org_id IS NULL`. Migratie 0019 had de 13 bestaande
  // dossiers net aan brink-licht gekoppeld, dus het veertiende viel er weer uit — en een
  // dossier zonder organisatie is per dossierScopeSql() alleen voor intern zichtbaar.
  // Een externe die er één maakte, zou hem daarna zelf niet meer terugzien.
  //
  // Intern mag kiezen (dat lijstje is er voor het koppelen van een klantproject); leeg
  // betekent nu "van Brink zelf" en niet meer "van niemand". Extern kiest niet: zijn
  // project valt onder zijn eigen organisatie, wat het formulier ook meestuurt — dat is
  // dezelfde regel als G39 (de invoer bepaalt de vraag, nooit het antwoord).
  const gevraagdeOrg = strOrNull(formData.get("orgId"));
  const orgId =
    toegang.soort === "intern"
      ? (gevraagdeOrg ?? toegang.primaireOrgId)
      : toegang.primaireOrgId;
  // Geen bruikbare organisatie → niet aanmaken. Dat kan alleen bij een account zonder
  // lidmaatschap of bij een extern account in meerdere organisaties (dan is er geen
  // eerlijk antwoord — zie Toegang.primaireOrgId). Liever niets dan een stuurloos dossier.
  if (!orgId) return;

  // Geen statuskeuze bij aanmaken: altijd 'concept'. Alleen de XIS-fase (default start).
  const dossier = await createDossier(db, {
    name,
    customer: strOrNull(formData.get("customer")),
    xisPhase: asXisPhase(formData.get("xisPhase")),
    orgId,
    actor: toegang.email ?? "anoniem",
  });
  redirect(`/projects/${dossier.id}`);
}

// De gevraagde velden van één spec-regel. Gedeeld door toevoegen en bewerken: het zijn
// letterlijk dezelfde velden, en één schema betekent dat er geen twee ideeën over
// "wat is een geldige regel" kunnen ontstaan. Alles optioneel behalve de fixtureCode —
// een regel mag half ingevuld zijn, dat is de werkelijkheid van een aanvraag.
//
// reqArticleCode is het gevraagde leveranciersartikelnummer ("21012 0298") en gaat als
// eerste signaal naar de matcher (docs/goal-artikelnummer-matching.md). Hij wordt
// getrimd maar verder ONGEMOEID gelaten: spaties en streepjes horen bij de code zoals de
// klant hem opschreef, en normaliseren gebeurt pas in de matcher (`normalizeSku`).
const specLineFieldsSchema = z.object({
  fixtureCode: zTrimmed.min(1),
  quantity: zOptionalInt,
  zone: zOptionalText.optional().default(null),
  brandText: zOptionalText.optional().default(null),
  productText: zOptionalText.optional().default(null),
  reqArticleCode: zOptionalText.optional().default(null),
  reqKelvin: zOptionalInt,
  reqCri: zOptionalInt,
  reqIp: zOptionalText.optional().default(null),
  reqWatt: zOptionalNumber.optional().default(null),
  reqLumen: zOptionalInt,
  reqBeamAngle: zOptionalNumber.optional().default(null),
  reqSizeCm: zOptionalNumber.optional().default(null),
  reqShape: zOptionalText.optional().default(null),
  reqColor: zOptionalText.optional().default(null),
  reqDimmable: zOptionalText.optional().default(null),
});

const addSpecLineSchema = specLineFieldsSchema.extend({ dossierId: zUuid });

// Handmatige regel toevoegen → matcher draait direct (functioneel ontwerp 3.4-5).
export async function addSpecLineAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const actor = await getActor();
  const parsed = parseForm(addSpecLineSchema, formData);
  // Ongeldige invoer voegt niets toe (regel 3): terug naar het dossier, geen 500. Zonder
  // bruikbaar dossier-id is er geen plek om naar terug te keren.
  if (!parsed.ok) {
    const dossierId = String(formData.get("dossierId") ?? "");
    if (!isUuid(dossierId)) notFound();
    revalidatePath(`/projects/${dossierId}`);
    return;
  }
  const { dossierId, ...velden } = parsed.data;
  const [row] = await addSpecLines(db, dossierId, [{ ...velden, source: "manual" }]);
  if (row) await runMatcher(db, row.id, actor);
  revalidatePath(`/projects/${dossierId}`);
}

// B6 (reviewzwerm 2.5a): er stond geen enkele bovengrens op het geplakte CSV-blok, niet in
// parseSpecCsv, niet in addSpecLines en niet hier — en daarna draaide er één matcher PER
// REGEL. Zelf-DoS door de enige gebruiker.
//
// De weerlegger heeft de omvang gemeten op PGlite: addSpecLines doet één INSERT met 22
// kolommen per rij, dus Postgres' bind-parameterlimiet (65535) kapt af boven 2978 regels —
// en dan draait er géén enkele matcher. "Honderdduizenden regels" kan dus niet; het
// realistische worstcase is ≤2978 matcher-runs waarbij de functietimeout de invocatie
// halverwege afkapt → een half gematcht dossier.
//
// Het ontwerp wíl >10 regels via een controlescherm (CSV_PROPOSAL_THRESHOLD = 10), maar
// createCsvProposalAction is nergens aangesloten — dode code. De "kleine plak"-aanname
// wordt dus door niets afgedwongen. Tot dat scherm er is, is dit de afdwinging.
//
// 500 is ruim boven elk echt armaturenboek (het Deerns-boek heeft er 20) en ruim onder
// zowel de parameterlimiet als de timeout. Precedent voor de vorm:
// app/data/brand-relations/actions.ts (BULK_MAX = 100), met exact deze redenering.
//
// Alles-of-niets, bewust: half inlezen levert precies het half gematchte dossier op dat we
// willen voorkomen, en dat is stiller en duurder om terug te draaien dan een weigering.
//
// De constante staat in lib/repo/dossiers.ts naast parseSpecCsv en NIET hier: een
// "use server"-module mag uitsluitend async functies exporteren. Een geëxporteerde const
// laat registerServerReference klappen met "Object.defineProperties called on non-object" —
// gemeten, niet beredeneerd.
export async function addSpecCsvAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId"));
  const csv = String(formData.get("csv") ?? "");
  const lines = parseSpecCsv(csv).map((l) => ({ ...l, source: "csv" as const }));
  if (lines.length > SPEC_CSV_MAX_LINES) {
    // Regel 5: het gebeurde, dus het staat in events. Er is (nog) geen terugmeldkanaal op
    // dit formulier; zonder dit event zou een geweigerde plak spoorloos zijn.
    await logEvent(db, {
      entity: "project_dossier",
      entityId: dossierId,
      action: "spec_csv_rejected_too_large",
      actor,
      payload: { lines: lines.length, max: SPEC_CSV_MAX_LINES },
    });
    revalidatePath(`/projects/${dossierId}`);
    return;
  }
  if (dossierId && lines.length) {
    const rows = await addSpecLines(db, dossierId, lines);
    for (const r of rows) await runMatcher(db, r.id, actor);
  }
  revalidatePath(`/projects/${dossierId}`);
}

// Bestek/telstaat plakken → aantallen koppelen op fixture-code (B-08/A-06).
export async function linkBestekAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
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
  const { toegang, scope } = await bewaakProject(input);
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

  // Router (goal-import-ai-leesroute, stap 3): vertrouwt de deterministische
  // parser het merk-lezen (≥60% bekende merken), dan blijft het bestaande €0-pad;
  // anders leest het model de tekstlaag (recordLeesrouteImport). Alleen bij een
  // aanwezige tekstlaag — zonder tekstlaag valt er niets te lezen en blijft de
  // eerlijke "no-text-layer"-melding (de beeld-OCR-route is dan de weg).
  const route = hadText ? beslisRoute(lines) : null;
  const routePayload = route
    ? route.route === "leesroute"
      ? {
          route: route.route,
          reden: route.reden,
          bekendeMerken: route.bekendeMerken,
          totaal: route.totaal,
        }
      : {
          route: route.route,
          bekendeMerken: route.bekendeMerken,
          totaal: route.totaal,
        }
    : {};

  if (route?.route === "leesroute" && envApiKey()) {
    const result = await recordLeesrouteImport(db, {
      dossierId,
      filename,
      pages,
      markdown,
      brandNames,
      routerBesluit: {
        reden: route.reden,
        bekendeMerken: route.bekendeMerken,
        totaal: route.totaal,
      },
      actor,
    });
    await logEvent(db, {
      entity: "dossier",
      entityId: dossierId,
      action: "pdf_import",
      actor,
      payload: {
        file: filename,
        hadText,
        imported: result.created,
        runId: result.run.id,
        ...routePayload,
        batches: result.batches,
        truncated: result.truncated,
        costEur: Number(result.costEur.toFixed(4)),
        ...(result.gestopt ? { gestopt: result.gestopt } : {}),
      },
    });
    revalidatePath(`/projects/${dossierId}`);
    redirect(
      `/projects/${dossierId}?pdf=${result.created}&run=${result.run.id}&route=leesroute`,
    );
  }

  // B2/stap 5: de import krijgt altijd een run (status 'bevestigd') als vaste plek voor
  // het markdown-controlespoor — ook bij nul regels of een ontbrekende tekstlaag.
  const { run } = await recordPdfImport(db, {
    dossierId,
    filename,
    lines,
    rawMarkdown: markdown,
    actor,
  });
  if (route?.route === "leesroute") {
    // Router zei leesroute maar er is geen AI-key: eerlijk terugvallen op het
    // deterministische resultaat, mét skip-event op de run — nooit stil.
    await logEvent(db, {
      entity: "import_run",
      entityId: run.id,
      action: "leesroute_skipped_no_key",
      actor,
      payload: { reden: "no_key", routerReden: route.reden },
    });
  }
  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "pdf_import",
    actor,
    payload: {
      file: filename,
      hadText,
      imported: lines.length,
      runId: run.id,
      ...routePayload,
    },
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
// C10: bovengrenzen op de overige client-invoer van ocrPageAction. 16 tegels = 4×4, ruim
// boven wat de A3-tiling nodig heeft; 20.000 px is ruim boven elke reële paginarender
// (A3 op 300 dpi ≈ 3500×4960).
const OCR_MAX_TILES = 16;
const OCR_MAX_DIMENSION = 20_000;

// Run starten (of hervatten, B5: zelfde dossier + bestand + ocrStatus 'bezig').
// Geen key → eerlijke melding vóór er ook maar iets gerenderd of geüpload wordt.
export async function startOcrImportAction(input: {
  dossierId: string;
  filename: string;
  pageCount: number;
}): Promise<
  | { error: string }
  // O4 (A3-tiling, stap 5): gedane TEGELS i.p.v. pagina's — tile 0 = hele
  // pagina, dus voor bestaande runs is dit één-op-één het oude donePages.
  | { runId: string; resumed: boolean; doneTiles: { page: number; tile: number }[] }
> {
  const { toegang, scope } = await bewaakProject(input);
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
  // (De "bestaat dit project"-check die hier stond zit sinds 3.2a in bewaakProject()
  // bovenaan deze functie — daar weegt hij meteen ook de org-scope mee.)
  const { run, resumed, doneTiles } = await startOcrRun(db, {
    dossierId,
    filename,
    pageCount,
    actor,
  });
  return { runId: run.id, resumed, doneTiles };
}

// Eén pagina: FormData met runId/dossierId/page/width/height + het beeld als File.
// De beeldrij-lock en het €1-plafond leven in de repo-laag (B4); hier alleen
// sessie, eigendom (run hoort bij dit dossier) en groottes.
export async function ocrPageAction(formData: FormData): Promise<
  | { error: string }
  | { alreadyDone: true }
  | { stopped: "budget_run" | "budget_month" | "no_key" }
  | { failed: string }
  | { created: number; duplicates: number; upgraded: number }
> {
  const { toegang, scope } = await bewaakProject(formData);
  const actor = await getActor();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  const page = intOrNull(formData.get("page"));
  const width = intOrNull(formData.get("width"));
  const height = intOrNull(formData.get("height"));
  // O4 (A3-tiling): optioneel tegelnummer + tegeltotaal. Afwezig = hele pagina
  // (tile 0, count 1) — de huidige client-loop stuurt de velden nog niet mee,
  // dus het gedrag blijft byte-identiek tot de tegel-lus (volgende stap) landt.
  const tileRaw = formData.get("tile");
  const tile = tileRaw == null ? 0 : intOrNull(tileRaw);
  const tileCountRaw = formData.get("tileCount");
  const tileCount = tileCountRaw == null ? 1 : intOrNull(tileCountRaw);
  const image = formData.get("image");
  // C10 (reviewzwerm 2.5a): er stonden alleen ONDERgrenzen (page >= 1, tile >= 0,
  // tileCount >= 1). OCR_MAX_PAGES gold uitsluitend bij het STARTEN van een run, dus een
  // los request mocht elk paginanummer noemen — pagina 999.999 van een boek van 12.
  // Het geschetste gevolg ("1.024 requests = 1 GB permanente opslag") is weerlegd: bij een
  // budgetstop zet processOcrPage de run op 'gestopt' en weigert dit endpoint daarna élk
  // volgend request vóór de opslag, dus er blijft één weesrij per run staan, niet duizend.
  // Wat blijft is de ontbrekende bovengrens zelf — hygiëne, in een paar regels te dichten.
  //
  // Deze bovengrenzen zijn statisch; de grens die er écht toe doet (page tegen het
  // werkelijke aantal pagina's van díe run) staat verderop, ná de run-lookup.
  if (!dossierId || !runId || !page || page < 1 || !width || !height) {
    return { error: "Invalid OCR page request." };
  }
  if (page > OCR_MAX_PAGES) {
    return { error: "Invalid OCR page request." };
  }
  if (
    tile == null ||
    tile < 0 ||
    tileCount == null ||
    tileCount < 1 ||
    tileCount > OCR_MAX_TILES ||
    // Tegel 3 van 2 bestaat niet; zonder deze check is `tile` los van `tileCount` vrij.
    tile >= tileCount
  ) {
    return { error: "Invalid OCR page request." };
  }
  // Ook de beeldafmetingen zijn client-input en gingen ongegrensd de database in.
  if (width < 1 || width > OCR_MAX_DIMENSION || height < 1 || height > OCR_MAX_DIMENSION) {
    return { error: "Invalid OCR page request." };
  }
  // Server-hardening: de PDF-loop stuurt JPEG (canvas → toBlob 'image/jpeg') en de
  // losse-beelden-route (goal-import-meer-formaten) mag óók PNG aanleveren — zónder
  // client-side hercodering (arbitragebesluit 20 aug). Alles anders is per definitie
  // geen legitiem paginabeeld.
  if (
    !(image instanceof File) ||
    (image.type !== "image/jpeg" && image.type !== "image/png")
  ) {
    return { error: "No JPEG or PNG page image supplied." };
  }
  if (image.size > OCR_IMAGE_CAP) {
    return { error: "Page image is larger than 2 MB." };
  }
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  // Magic bytes (lib/bytes/magic.ts): het gedeclareerde type is client-input — de
  // bytes zelf moeten het waarmaken vóór ze opgeslagen en naar de vision-API gaan.
  const bytesOk =
    image.type === "image/png" ? isPngImage(imageBytes) : isJpegImage(imageBytes);
  if (!bytesOk) {
    return { error: "Page image bytes do not match the declared image type." };
  }
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== dossierId || run.source !== "ocr") {
    return { error: "Unknown OCR run for this project." };
  }
  if (run.ocrStatus !== "bezig") {
    return { error: "This OCR run is no longer active." };
  }
  // C10, de grens die er echt toe doet: `page` werd nergens getoetst tegen het aantal
  // pagina's dat déze run daadwerkelijk heeft. Pagina 400 van een boek van 12 leverde een
  // opgeslagen paginabeeld en een vision-call op voor een pagina die niet bestaat.
  const pageCount = run.counts?.pageCount;
  if (typeof pageCount === "number" && pageCount > 0 && page > pageCount) {
    return { error: "Invalid OCR page request." };
  }

  const result = await processOcrPage(db, {
    runId,
    page,
    tile,
    tileCount,
    imageBytes,
    mime: image.type,
    width,
    height,
    actor,
  });
  if ("alreadyDone" in result) return { alreadyDone: true };
  // De reden komt onvertaald uit de repo-laag naar de kaart. Hier stond eerder een
  // ternary die budget_run en budget_month tot één 'budget' plette — dan noemt de
  // melding een volle maandcap "het €1-budget van dit boek" en is ze onwaar: andere
  // oorzaak, andere oplossing (cap ophogen vs. wachten op een nieuwe run).
  if ("skipped" in result) return { stopped: result.skipped };
  if ("failed" in result) return { failed: result.failed };
  // Regels verschijnen progressief op de projectpagina terwijl de loop draait.
  revalidatePath(`/projects/${dossierId}`);
  return {
    created: result.created,
    duplicates: result.duplicates,
    upgraded: result.upgraded,
  };
}

// Afronden: transcript + ocrStatus 'klaar' + ocr_done-event, daarna terug naar de
// projectpagina met ?ocr=<aantal regels>&run=<id> (zelfde patroon als ?pdf=…).
export async function finishOcrAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
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

// ── Tabel-import: xlsx / csv / docx (goal-import-meer-formaten, Bouwer A stap 4) ──
// Transport is gechunkt (start → chunk → finish, B4-lockpatroon): één FormData-call
// van 4 MB zou Vercel's ~4,5 MB-limiet raken. Limieten zijn interface-afspraak met
// Bouwer B: 15 MB totaal, 2 MB per chunk, max 8 chunks; daarboven leest de client
// de rijen zelf en gaat het via importTabelRowsAction (bronbestand niet opgeslagen).
//
// Filename-conventie N losse beelden (afspraak met Bouwer B, hier vastgelegd omdat de
// server hem óók moet kennen voor het OCR-run-bestand): de client bundelt N jpg/png's
// onder één synthetische naam `armaturenstaat-<dossierId-kort>-<yyyymmdd>.beelden`,
// waarbij beeld i = pagina i van de OCR-run. Die route loopt via de bestaande
// start/ocrPage/finish-acties (ocrPageAction accepteert sinds vandaag ook PNG).

// Welke parser bij welk bestand hoort. Extensie eerst, mime secundair — mimes zijn
// tussen browsers rommelig (csv komt ook als application/vnd.ms-excel binnen).
function tableKindOf(
  filename: string,
  mime: string,
): "xlsx" | "csv" | "docx" | null {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv" || ext === "tsv" || ext === "txt") return "csv";
  if (ext === "docx") return "docx";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return "xlsx";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (mime === "text/csv" || mime === "text/tab-separated-values") return "csv";
  return null;
}

const startTableImportSchema = z.object({
  dossierId: zUuid,
  filename: zTrimmed.min(1).max(255),
});

// Run starten of hervatten. doneChunks voedt de client-loop (die slaat die chunks
// over); de chunk-rij zelf is het idempotentie-lock (unique(run, chunk)).
export async function startTableImportAction(input: {
  dossierId: string;
  filename: string;
}): Promise<{ error: string } | { runId: string; doneChunks: number[] }> {
  const { toegang, scope } = await bewaakProject(input);
  const actor = await getActor();
  const parsed = parseJson(startTableImportSchema, input);
  if (!parsed.ok) return { error: parsed.error };
  const { run, doneChunks } = await startTableImport(db, {
    dossierId: parsed.data.dossierId,
    filename: parsed.data.filename,
    actor,
  });
  return { runId: run.id, doneChunks };
}

const uploadChunkSchema = z.object({
  dossierId: zUuid,
  runId: zUuid,
  chunk: zBoundedInt(0, SOURCE_MAX_CHUNKS - 1),
});

// Eén chunk. Idempotent: een dubbel verstuurde chunk conflicteert op unique(run,
// chunk) en meldt {alreadyDone} — hervatten kost niets en kan nooit dubbel opslaan.
export async function uploadSourceChunkAction(formData: FormData): Promise<
  { error: string } | { ok: true; alreadyDone: boolean }
> {
  const { toegang, scope } = await bewaakProject(formData);
  const parsed = parseForm(uploadChunkSchema, formData);
  if (!parsed.ok) return { error: parsed.error };
  const { dossierId, runId, chunk } = parsed.data;
  const blob = formData.get("bytes");
  if (!(blob instanceof File) || blob.size === 0) {
    return { error: "No chunk supplied." };
  }
  if (blob.size > SOURCE_CHUNK_MAX_BYTES) {
    return { error: "Chunk is larger than 2 MB." };
  }
  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== dossierId || run.source !== "tabel") {
    return { error: "Unknown table import for this project." };
  }
  if (run.status !== "voorstel") {
    return { error: "This table import is already finished." };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { alreadyDone } = await addSourceChunk(db, {
    runId,
    filename: run.filename ?? blob.name,
    mime: blob.type || "application/octet-stream",
    chunk,
    bytes,
  });
  return { ok: true, alreadyDone };
}

// Welk tabblad de gebruiker koos. 1-gebaseerd, zoals de tabjes tellen; dezelfde
// bovengrens als waarmee chooseSheet bladen aanbiedt, zodat de server nooit iets
// aanbiedt dat zijn eigen schema daarna weigert.
const sheetIndexSchema = z.number().int().min(1).max(MAX_SHEETS).optional();
const finishTableImportSchema = z.object({
  dossierId: zUuid,
  runId: zUuid,
  // Ontbreekt bij de eerste finish; de server bepaalt dan zelf of er te kiezen valt.
  sheetIndex: sheetIndexSchema,
});

// Afronden: assembleren, maat- en magic-bytes-check, parsen, regels + matcher +
// verplichte 'tabel'-review (recordTableImport), events, redirect ?tabel=<n>&run=<id>.
export async function finishTableImportAction(input: {
  dossierId: string;
  runId: string;
  sheetIndex?: number;
}): Promise<{ error: string } | { sheetChoice: SheetChoice } | void> {
  const { toegang, scope } = await bewaakProject(input);
  const actor = await getActor();
  const parsed = parseJson(finishTableImportSchema, input);
  if (!parsed.ok) return { error: parsed.error };
  const { dossierId, runId, sheetIndex } = parsed.data;

  const run = await getImportRun(db, runId);
  if (!run || run.dossierId !== dossierId || run.source !== "tabel") {
    return { error: "Unknown table import for this project." };
  }
  // Idempotentie-poort (zelfde constructie als confirmImportRun): een run die al
  // afgerond is doet niets meer — een dubbele finish kan geen regels verdubbelen.
  if (run.status !== "voorstel") {
    return { error: "This table import is already finished." };
  }

  const reject = async (reden: string, extra?: Record<string, unknown>) => {
    await logEvent(db, {
      entity: "import_run",
      entityId: runId,
      action: "tabel_import_rejected",
      actor,
      payload: { reden, filename: run.filename, ...extra },
    });
  };

  const file = await assembleSourceFile(db, runId);
  if (!file) {
    await reject("geen_chunks");
    return { error: "No file chunks were uploaded for this import." };
  }
  if (file.bytes.length > SOURCE_FILE_MAX_BYTES) {
    // kan alleen via een client die de afspraak schendt (8 × 2 MB = 16 MB > 15 MB)
    await reject("te_groot", { size: file.bytes.length });
    return { error: "The assembled file is larger than 15 MB." };
  }

  const kind = tableKindOf(file.filename, file.mime);
  if (!kind) {
    await reject("onbekend_type", { mime: file.mime });
    return { error: "Unknown file type; expected .xlsx, .csv or .docx." };
  }
  // Magic bytes: xlsx en docx zijn PK-zip-containers; het gedeclareerde mime/de
  // extensie is client-input, de bytes moeten het waarmaken vóór een parser start.
  if ((kind === "xlsx" || kind === "docx") && !isZipContainer(file.bytes)) {
    await reject("bytes_geen_office_bestand", { kind });
    return { error: "The file bytes are not a valid Office document." };
  }

  let rows: TableRows;
  // Bij xlsx: alle bladen apart, plus de proefparse waarop de keuze rust. Beide staan
  // hier al klaar vóór de beslissing, want die beslissing valt buiten de try — een
  // `return` binnen een try met een kale `catch` zou als "parse_fout" eindigen.
  let bladRijen = new Map<number, TableRows>();
  let bladen: SheetSummary[] = [];
  // In de try staat ALLEEN het parsen. De catch eronder logt 'parse_fout', en dat moet
  // ook waar zijn: het vrije-tekst-pad hieronder doet een AI-leesroute, schrijft regels
  // weg en eindigt in redirect() — geen van drieën is parsen. Stond het er wél in (tot
  // 2026-08-20), dan slikte de catch het navigatiesignaal van een GESLAAGDE import op:
  // redirect() werkt door te gooien (NEXT_REDIRECT-digest), dus een docx zonder tabellen
  // die netjes was ingelezen kreeg "The file could not be parsed." terug, mét een
  // misleidend tabel_import_rejected-event. Zelfde foutklasse als de lege catch in
  // CLAUDE.md, maar dan serverkant.
  let docxFreeText = "";
  try {
    if (kind === "xlsx") {
      const sheets = await sheetsFromXlsx(file.bytes);
      bladRijen = new Map(sheets.map((sheet) => [sheet.index, sheet.rows]));
      bladen = summarizeSheets(sheets);
      rows = []; // wordt hieronder gezet, zodra vaststaat wélk blad het wordt
    } else if (kind === "csv") {
      rows = rowsFromCsv(new TextDecoder().decode(file.bytes));
    } else {
      const docx = await rowsFromDocx(file.bytes);
      rows = docx.rows;
      docxFreeText = docx.freeText;
    }
  } catch {
    await reject("parse_fout", { kind });
    return { error: "The file could not be parsed." };
  }

  // Welk tabblad? Eén werkboek kan twee UITVOERINGEN van dezelfde armaturenstaat
  // dragen; optellen zou elke ruimte twee keer verlichten. Zie
  // docs/probleem-meerdere-tabbladen.md. De beslissing zelf staat in
  // lib/table/sheet-choice.ts, gedeeld met het >15 MB-clientpad.
  let gekozenBlad: SheetOption | null = null;
  if (kind === "xlsx") {
    // Een teruggestuurde sheetIndex is client-invoer: alleen een blad dat in ONZE eigen
    // proef als datablad naar voren kwam mag geïmporteerd worden. Anders zou een
    // geknutselde index een verborgen sjabloonblad de offerte in kunnen duwen.
    if (sheetIndex != null && !isChoosableSheet(bladen, sheetIndex)) {
      await reject("onbekend_tabblad", {
        sheetIndex,
        sheets: bladen.map(
          (b): SheetOption => ({ index: b.index, name: b.name, lines: b.lines }),
        ),
      });
      return {
        error: "That sheet is not part of this file, or holds no luminaire lines.",
      };
    }
    const beslissing =
      sheetIndex != null
        ? ({ kind: "auto", index: sheetIndex } as const)
        : chooseSheet(bladen);

    if (beslissing.kind === "choose") {
      // Niets importeren: de run blijft op 'voorstel' staan, zodat de tweede finish
      // (mét sheetIndex) de idempotentie-poort hierboven gewoon passeert. Tab dicht
      // tijdens de keuze? Zelfde bestand opnieuw kiezen hervat de run.
      await logEvent(db, {
        entity: "import_run",
        entityId: runId,
        action: "tabel_sheet_keuze_nodig",
        actor,
        payload: {
          filename: file.filename,
          sheets: beslissing.sheets,
          skipped: beslissing.skipped,
        },
      });
      return {
        sheetChoice: { sheets: beslissing.sheets, skipped: beslissing.skipped },
      };
    }

    rows = bladRijen.get(beslissing.index) ?? [];
    const blad = bladen.find((b) => b.index === beslissing.index);
    if (blad) {
      gekozenBlad = { index: blad.index, name: blad.name, lines: blad.lines };
    }
  }

  if (kind === "docx" && rows.length === 0) {
    // Vrije-tekst-fallback (docx zonder tabellen): het ENIGE AI-pad van de
    // tabel-import — de rij-variant van de leesroute (LEVER_REGELS_TOOL_RIJEN,
    // '=== ROW N ==='-markers), georkestreerd in lib/repo/table-freetext.ts.
    if (docxFreeText.trim() === "") {
      await reject("docx_leeg");
      return { error: "This Word document contains no tables and no text." };
    }
    if (!envApiKey()) {
      // Zonder key valt er niets te lezen — eerlijk melden vóór de run wordt
      // afgerond; de upload blijft staan en kan later opnieuw worden afgerond.
      await reject("docx_zonder_tabellen_geen_key");
      return {
        error:
          "This Word document contains no tables, and reading free-running text needs an AI key. Paste the rows as CSV instead.",
      };
    }
    const brandNames = (
      await db.select({ name: brands.name }).from(brands)
    ).map((b) => b.name);
    const vrij = await recordDocxFreeTextImport(db, {
      dossierId,
      runId,
      filename: file.filename,
      freeText: docxFreeText,
      brandNames,
      actor,
    });
    await logEvent(db, {
      entity: "import_run",
      entityId: runId,
      action: "source_file_stored",
      actor,
      payload: {
        filename: file.filename,
        mime: file.mime,
        size: file.bytes.length,
        chunks: file.chunks,
        kind: "docx_vrije_tekst",
        rows: vrij.created.length,
        batches: vrij.batches,
        costEur: Number(vrij.costEur.toFixed(4)),
        ...(vrij.gestopt ? { gestopt: vrij.gestopt } : {}),
      },
    });
    revalidatePath(`/projects/${dossierId}`);
    redirect(
      `/projects/${dossierId}?tabel=${vrij.created.length}&run=${runId}`,
    );
  }

  const brandNames = (await db.select({ name: brands.name }).from(brands)).map(
    (b) => b.name,
  );
  const { lines, headerRow } = parseSpecLinesFromRows(rows, brandNames);

  const result = await recordTableImport(db, {
    dossierId,
    filename: file.filename,
    lines,
    rawMarkdown: rowsToMarkdown(rows),
    existingRunId: runId,
    actor,
  });

  // Regel 5 + afspraak: source_file_stored éénmaal per bestand, niet per chunk.
  await logEvent(db, {
    entity: "import_run",
    entityId: runId,
    action: "source_file_stored",
    actor,
    payload: {
      filename: file.filename,
      mime: file.mime,
      size: file.bytes.length,
      chunks: file.chunks,
      kind,
      rows: rows.length,
      headerRow,
      ...(gekozenBlad ? { sheet: gekozenBlad } : {}),
    },
  });

  revalidatePath(`/projects/${dossierId}`);
  redirect(`/projects/${dossierId}?tabel=${result.created.length}&run=${runId}`);
}

// >15 MB-pad: het bronbestand wordt NIET opgeslagen; de client heeft de rijen zelf
// gelezen en stuurt ze als JSON. Zelfde parser en zelfde review-plicht — alleen het
// audit trail-bestand ontbreekt (event source_file_skipped_too_large legt dat vast;
// sourceStored:false in de payload is het contract met Bouwer B).
const TABEL_MAX_ROWS = 5000; // ruim boven elke echte armaturenstaat, onder elk DoS-pad
const TABEL_MAX_CELLS = 64;
const TABEL_TEXT_CAP = 5 * 1024 * 1024; // zelfde grens als PAGES_TEXT_CAP

const importTabelRowsSchema = z.object({
  dossierId: zUuid,
  filename: zTrimmed.min(1).max(255),
  rows: z
    .array(z.array(z.string()).max(TABEL_MAX_CELLS))
    .max(TABEL_MAX_ROWS),
  // Welk tabblad de client koos, puur voor het audit-spoor. Meer weet de server op dit
  // pad niet: het bronbestand wordt hier bewust niet opgeslagen, dus we kunnen de keuze
  // niet zelf narekenen. De beslissing zelf viel in de browser, met dezelfde
  // chooseSheet als het serverpad.
  sheetName: zTrimmed.max(255).optional(),
  sheetCount: z.number().int().min(1).max(MAX_SHEETS).optional(),
});

export async function importTabelRowsAction(input: {
  dossierId: string;
  filename: string;
  rows: string[][];
  sheetName?: string;
  sheetCount?: number;
}): Promise<{ error: string } | void> {
  const { toegang, scope } = await bewaakProject(input);
  const actor = await getActor();
  const parsed = parseJson(importTabelRowsSchema, input);
  if (!parsed.ok) return { error: parsed.error };
  const { dossierId, filename, rows, sheetName, sheetCount } = parsed.data;
  const totalChars = rows.reduce(
    (n, r) => n + r.reduce((m, c) => m + c.length, 0),
    0,
  );
  if (totalChars > TABEL_TEXT_CAP) {
    return { error: "The pasted rows exceed 5 MB of text." };
  }

  const brandNames = (await db.select({ name: brands.name }).from(brands)).map(
    (b) => b.name,
  );
  const { lines } = parseSpecLinesFromRows(rows, brandNames);
  const result = await recordTableImport(db, {
    dossierId,
    filename,
    lines,
    rawMarkdown: rowsToMarkdown(rows),
    actor,
  });
  await logEvent(db, {
    entity: "import_run",
    entityId: result.run.id,
    action: "source_file_skipped_too_large",
    actor,
    payload: {
      filename,
      rows: rows.length,
      sourceStored: false,
      ...(sheetName != null ? { sheet: { name: sheetName, count: sheetCount } } : {}),
    },
  });

  revalidatePath(`/projects/${dossierId}`);
  redirect(
    `/projects/${dossierId}?tabel=${result.created.length}&run=${result.run.id}`,
  );
}

// Matcher (opnieuw) draaien op één regel.
export async function runMatchAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  if (specLineId) await runMatcher(db, specLineId, await getActor());
  revalidatePath(`/projects/${dossierId}`);
}

// Sprint M1 (docs/plan-matchstation-eigen-machine.md): dossier in de wachtrij zetten
// voor het matchstation (de EliteDesk, M2 — nog niet gebouwd). Intern-only: dit is
// Brink's eigen werkvoorraad, geen klanthandeling — vergelijkbaar met de andere
// interne blokken op /settings ("intern? toon", niet "extern? verberg"). Idempotent
// (enqueueDossierForMatching wijst een dubbele wachtrij-entry zelf af); geen foutmelding
// nodig bij een dubbelklik, gewoon revalidaten.
export async function enqueueForMatchstationAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  if (!dossierId || toegang.soort !== "intern") {
    revalidatePath(`/projects/${dossierId}`);
    return;
  }
  await enqueueDossierForMatching(db, dossierId, await getActor());
  revalidatePath(`/projects/${dossierId}`);
}

// Kandidaat kiezen (regel-detail 3.6). Uit lijst 2 is een reden verplicht.
export async function chooseCandidateAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
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
  const { toegang, scope } = await bewaakProject(formData);
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
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (specLineId && reason) await unlinkMatch(db, specLineId, reason, await getActor());
  redirect(`/projects/${dossierId}/line/${specLineId}`);
}

// Dagprijs op de regel (I-04).
// C4 (reviewzwerm 2.5a): `numOrNull` controleerde alleen op NaN, dus een negatieve
// dagprijs liep zo door naar numeric(12,2) en naar countedLineTotal. De enige grens stond
// in de UI (type=number min=0) — dat is uitleg voor de gebruiker, geen regel van het
// systeem. Dit raakt geld, dus de check staat op twee plekken: hier op de vorm, en als
// domeininvariant in setDayPrice zelf (zie docs/INVOERVALIDATIE.md, uitzondering bij
// regel 2). Een bedrag van 0 blijft geldig — "gratis meegeleverd" is een echte uitkomst.
const setDayPriceSchema = z.object({
  dossierId: zUuid,
  specLineId: zUuid,
  price: zPrice,
  validUntil: zOptionalText.optional().default(null),
});

export async function setDayPriceAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const parsed = parseForm(setDayPriceSchema, formData);
  // Ongeldige invoer verandert niets; de gebruiker keert terug naar dezelfde regel en ziet
  // de oude prijs nog staan. Een uuid dat niet klopt heeft geen regel om naar terug te
  // keren, dus dan is 404 het eerlijke antwoord.
  if (!parsed.ok) {
    const dossierId = String(formData.get("dossierId") ?? "");
    const specLineId = String(formData.get("specLineId") ?? "");
    if (!isUuid(dossierId) || !isUuid(specLineId)) notFound();
    redirect(`/projects/${dossierId}/line/${specLineId}`);
  }
  const { dossierId, specLineId, price, validUntil } = parsed.data;
  await setDayPrice(db, {
    specLineId,
    price,
    validUntil,
    actor: await getActor(),
  });
  redirect(`/projects/${dossierId}/line/${specLineId}`);
}

// Review-beslissing (3.7). Bevestigende keuzes dragen optioneel het gekozen productId
// ("welke van deze N", kleurvariant) — de repo maakt de regel dan groen met merkteken
// "handmatig gekozen" (herontwerp 2026-07-14).
export async function decideReviewAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
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
  const { toegang, scope } = await bewaakProject(formData);
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
//
// C3 (reviewzwerm 2.5a): `kind` werd met `as` gecast en ging zo rechtstreeks een pgEnum
// in. Een onbekende waarde gaf `invalid input value for enum review_kind` (22P02) → een
// 500. De UPDATE faalde netjes atomair en app/error.tsx ving hem af, dus er ging niets
// stuk — maar een 500 is nooit het goede antwoord op slechte invoer. Nu een schema-parse
// volgens docs/INVOERVALIDATIE.md; onbekende invoer verandert simpelweg niets.
//
// ⚠️ Sinds sprint M1 (docs/goal-agent-matching.md) heeft review_kind twee extra waarden,
// 'onzeker' en 'niet_beoordeeld' — maar die zijn UITSLUITEND een uitkomst van het
// matchstation (lib/repo/matchstation.ts, applyMatchstationResult), nooit een keuze die
// een mens hier handmatig zet. Vandaar een vaste lijst en niet langer
// `reviewKind.enumValues`: de oude "één bron"-redenering ging op zolang de enum alleen
// mensen-triggerbare soorten had, en dat is niet meer zo.
const HUMAN_REVIEW_KINDS = ["geel", "variant", "onvolledig", "ocr"] as const;
const flagReviewSchema = z.object({
  dossierId: zUuid,
  specLineId: zUuid,
  kind: zEnumFrom(HUMAN_REVIEW_KINDS),
});

export async function flagReviewAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const parsed = parseForm(flagReviewSchema, formData);
  if (!parsed.ok) return;
  const { dossierId, specLineId, kind } = parsed.data;
  await flagForReview(db, specLineId, kind, await getActor());
  revalidatePath(`/projects/${dossierId}`);
}

export async function setQuantityAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  const specLineId = String(formData.get("specLineId"));
  const quantity = intOrNull(formData.get("quantity"));
  if (specLineId) await setQuantity(db, specLineId, quantity, await getActor());
  revalidatePath(`/projects/${dossierId}/quote`);
}

// A-10: kopblok van de estimate opslaan (bewerkbaar tot uitsturen).
export async function saveQuoteHeaderAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
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

const editSpecLineSchema = specLineFieldsSchema.extend({
  dossierId: zUuid,
  specLineId: zUuid,
});

// B-10: een spec-regel bewerken → daarna de matcher opnieuw draaien.
export async function editSpecLineAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const actor = await getActor();
  const parsed = parseForm(editSpecLineSchema, formData);
  // Ongeldige invoer laat de regel zoals hij was; de gebruiker komt terug op dezelfde
  // pagina en ziet de oude waarden nog staan (regel 3).
  if (!parsed.ok) {
    const dossierId = String(formData.get("dossierId") ?? "");
    const specLineId = String(formData.get("specLineId") ?? "");
    if (!isUuid(dossierId) || !isUuid(specLineId)) notFound();
    redirect(`/projects/${dossierId}/line/${specLineId}`);
  }
  const { dossierId, specLineId, ...velden } = parsed.data;
  await updateSpecLine(db, specLineId, velden, actor);
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
  const { toegang, scope } = await bewaakProject(formData);
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
  const { toegang, scope } = await bewaakProject(formData);
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

// B7 (reviewzwerm 2.5a) gaf deze action een actor en een event; volgens de conventie van
// docs/INVOERVALIDATIE.md ("een action die je aanraakt, zet je om") gaat hij daarmee ook
// naar een schema-parse. Dat is hier meer dan boekhouding: dit is de enige destructieve
// action op een spec-regel, en de oude `if (specLineId)`-guard liet elke niet-lege string
// door. `dossierId` werd zelfs ongecontroleerd in revalidatePath gezet.
const deleteLineSchema = z.object({
  dossierId: zUuid,
  specLineId: zUuid,
});

export async function deleteLineAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const parsed = parseForm(deleteLineSchema, formData);
  if (!parsed.ok) return;
  const { dossierId, specLineId } = parsed.data;
  await deleteSpecLine(db, specLineId, await getActor());
  revalidatePath(`/projects/${dossierId}`);
}

export async function generateQuoteAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId"));
  if (dossierId) await generateQuote(db, scope, dossierId, await getActor());
  redirect(`/projects/${dossierId}/quote`);
}

// B6, stap 4: statuswijziging via de ene schrijver (lib/repo/project-status.ts) — de
// afgeleide fase gaat in dezelfde update mee. Archief zonder reden wordt serverside
// geweigerd; die fout vangen we hier op (de UI dwingt de reden al af — dit is het vangnet).
export async function setStatusAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const status = formData.get("status");
  if (!dossierId || !PROJECT_STATUSES.includes(status as ProjectStatus)) return;
  try {
    await setStatus(db, scope, dossierId, status as ProjectStatus, await getActor(), {
      reason: strOrNull(formData.get("reason")),
    });
  } catch {
    // Reden verplicht bij archiveren → geen crash, project blijft ongewijzigd.
  }
  revalidatePath(`/projects/${dossierId}`);
  revalidatePath("/projects");
}

export async function setXisPhaseAction(formData: FormData) {
  const { toegang, scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const xisPhase = formData.get("xisPhase");
  if (!dossierId || !XIS_PHASES.includes(xisPhase as XisPhase)) return;
  await setXisPhase(db, scope, dossierId, xisPhase as XisPhase, await getActor());
  revalidatePath(`/projects/${dossierId}`);
  revalidatePath("/projects");
}
