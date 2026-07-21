"use server";

// De drie server-actions van het retour-pad (sprint 1.2, docs/plan-1-2-retourpad.md):
// uploaden → voorstel → goedkeuren/afwijzen. Patroon: app/projects/[id]/import/actions.ts
// (sessie eisen, FormData uitlezen, repo-laag laten schrijven, redirecten).
//
// DEZE LAAG SCHRIJFT NIETS ZELF. Hij leest FormData, bewaakt de grenzen die alleen hier te
// bewaken zijn (sessie, cap) en geeft het door aan lib/repo/template-return.ts. Elke event
// die de catalogus raakt wordt daar gelogd, bij de schrijf zelf — niet hier, want een
// action die logt maar niet schrijft liegt bij een crash ertussenin.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { TemplateUploadState } from "@/components/data/template-upload-card";
import { MAX_TEMPLATE_UPLOAD_BYTES, templateCapMelding } from "@/components/data/template-upload-limits";
import { validateFilledTemplateXlsx } from "@/lib/excel-validate";
import { afwijzingsTekst } from "@/lib/excel-validate-messages";
import { laadCatalogus } from "@/lib/repo/custom-fields";
import { logEvent } from "@/lib/repo/events";
import {
  applyTemplateProposal,
  loadBestaandeProducten,
  rejectTemplateProposal,
  stageTemplateReturn,
  type PriceListInput,
} from "@/lib/repo/template-return";
import type { ApplySelection, TemplateReturnPayload } from "@/lib/template-diff";
import { getActor, requireSession } from "@/lib/session";

const voorstelPad = (brandId: string, uploadId: string) =>
  `/data/brand-relations/${brandId}/upload/${uploadId}`;

/** Na een schrijf: het merkrelatie-scherm toont de open uploads en de relatiestatus, het
 *  overzicht telt de statussen, /data draagt de badge. Zelfde set als actions.ts. */
function herlaadMerkschermen(brandId: string) {
  revalidatePath(`/data/brand-relations/${brandId}`);
  revalidatePath("/data/brand-relations");
  revalidatePath("/data");
}

// ── 1. Uploaden ─────────────────────────────────────────────────────────────

/**
 * Valideert een ingevulde template en zet hem bij succes op staging. Komt nooit met een
 * "ok" terug: bij een geldig bestand redirect hij naar het voorstel-scherm (zie
 * TemplateUploadState — een geslaagde upload is geen melding maar een scherm).
 */
export async function uploadTemplateAction(
  _prev: TemplateUploadState,
  formData: FormData,
): Promise<TemplateUploadState> {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Unknown brand." };

  const file = formData.get("template");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose the filled template (.xlsx) first." };
  }

  // DE CAP IS DE EERSTE CHECK EN DE GEZAGHEBBENDE (besluit 7). De kaart checkt hem ook,
  // maar dat is een dienst aan de gebruiker, geen grens: een request komt hier ook zonder
  // die kaart binnen. Vóór arrayBuffer(), want die trekt het hele bestand het geheugen in.
  if (file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "template_upload_too_large",
      actor: await getActor(),
      payload: { filename: file.name, fileSize: file.size, cap: MAX_TEMPLATE_UPLOAD_BYTES },
    });
    return { status: "error", message: templateCapMelding(file.size) };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // LEGE SET, NOOIT undefined. In de 1.1-API betekent undefined "sla de check over"
  // (→ artikelcodesGecontroleerd: false, geen onbekende_artikelcode-waarschuwingen), en
  // een lege Set betekent "dit merk heeft nog geen producten → élke rij is nieuw". Dat is
  // iets heel anders: bij undefined ziet een eerste levering van 400 rijen eruit als een
  // schoon bestand, en verdwijnt precies de dubbelcheck die dit pad moet dragen. Een merk
  // zonder producten levert hier per constructie een lege Map en dus een lege Set.
  //
  // Uit dezelfde bron als de diff-engine leest (loadBestaandeProducten), niet uit een
  // eigen query: de sleutels van die map ZIJN de getrimde, hoofdlettergevoelige codes van
  // codeVoorLookup(). Een tweede query met een eigen normalisatie zou de validator "bekend"
  // laten zeggen waar de diff "nieuw" concludeert — stil een dubbelproduct.
  const knownArticleCodes = new Set(
    (await loadBestaandeProducten(db, brandId)).keys(),
  );

  // De COMPLETE catalogus, uit dezelfde bron als de template-route: valideert hij tegen
  // FIELD_CATALOG, dan komen de eigen kolommen die het merk keurig invulde binnen als
  // `onbekendeKolommen` — netjes gemeld, en toch weggegooid.
  const catalogus = await laadCatalogus(db);

  const resultaat = await validateFilledTemplateXlsx(bytes, catalogus, {
    knownArticleCodes,
  });

  if (!resultaat.ok) {
    // Geen staging-rij, geen statuswijziging (besluit 6) — wel een spoor (besluit 8).
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "template_upload_rejected_format",
      actor: await getActor(),
      payload: { filename: file.name, fileSize: file.size, reden: resultaat.reden },
    });
    return {
      status: "rejected",
      reden: resultaat.reden,
      // De 1.1-renderer maakt de zin, hier — serverside. De kaart is een client component
      // en zou excel-validate-messages (→ exceljs) anders de browserbundel in trekken.
      tekst: afwijzingsTekst(resultaat.reden),
    };
  }

  // De VALIDATOR-snapshot, niet de diff: die wordt bij élke render vers herberekend
  // (besluit 2). Rauwe xlsx-bytes bewaren we niet — deze snapshot is verliesvrij voor
  // alles wat wij ermee doen.
  const payload: TemplateReturnPayload = {
    v: 1,
    filename: file.name,
    fileSize: file.size,
    werkblad: resultaat.werkblad,
    rijen: resultaat.rijen,
    waarschuwingen: resultaat.waarschuwingen,
    kolommen: resultaat.kolommen.map((k) => k.fieldKey),
    onbekendeKolommen: resultaat.onbekendeKolommen,
    ontbrekendeOptioneleKolommen: resultaat.ontbrekendeOptioneleKolommen.map(
      (k) => k.fieldKey,
    ),
    artikelcodesGecontroleerd: resultaat.artikelcodesGecontroleerd,
  };

  // stageTemplateReturn zet de relatiestatus op 'data_ontvangen' en logt
  // template_upload_staged (besluit 6 + 8) — één schrijver, zoals K2 het wil.
  const { uploadId } = await stageTemplateReturn(db, {
    brandId,
    payload,
    actor: await getActor(),
  });

  herlaadMerkschermen(brandId);
  redirect(voorstelPad(brandId, uploadId));
}

// ── 2. Goedkeuren ───────────────────────────────────────────────────────────

/** Sleutels die van het formulier zelf zijn en nooit een selectie betekenen. */
const FORMULIER_VELDEN = new Set([
  "brandId",
  "uploadId",
  "reviewNote",
  "priceListName",
  "priceListValidFrom",
  "priceListValidUntil",
]);

/**
 * FormData → ApplySelection. Een uitgevinkte checkbox stuurt níéts mee, dus AANWEZIGHEID
 * is "aangevinkt" — hetzelfde principe als checkedIndicesFrom() in de import-actions.
 *
 * DE VALUE IS DE STALE-GUARD, niet decoratie: het is de oude waarde zoals hij op het
 * scherm stond (prevSeen). "" betekent "het veld was leeg" → null. applyTemplateProposal
 * legt hem naast de actuele DB-waarde en slaat het veld over als de catalogus intussen
 * wijzigde — nooit blind overschrijven wat de gebruiker niet zag.
 */
function selectieUit(formData: FormData): ApplySelection {
  const selectie: ApplySelection = { fields: new Map(), newProducts: new Set() };
  for (const [key, value] of formData.entries()) {
    if (FORMULIER_VELDEN.has(key) || typeof value !== "string") continue;
    if (key.startsWith("np.r")) {
      selectie.newProducts.add(key);
    } else if (/^r\d+\./.test(key)) {
      selectie.fields.set(key, value === "" ? null : value);
    }
  }
  return selectie;
}

export async function approveTemplateProposalAction(formData: FormData) {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const uploadId = String(formData.get("uploadId") ?? "").trim();
  if (!brandId || !uploadId) return;

  // Alleen meesturen als er echt een lijst uitgevraagd is. De fieldset verschijnt alleen
  // zonder actieve lijst (besluit 1); staat hij er niet, dan erven de regels de geldigheid
  // van de actieve lijst en heeft de repo-laag niets van ons nodig.
  const name = String(formData.get("priceListName") ?? "").trim();
  const validFrom = String(formData.get("priceListValidFrom") ?? "").trim();
  const validUntil = String(formData.get("priceListValidUntil") ?? "").trim();
  // Alle drie of geen: een lijst zonder einddatum voedt ijzeren regel 3 niet, en
  // upsertPriceLines weigert hem terecht. Half doorgeven zou die weigering hier verstoppen.
  const newList: PriceListInput | null =
    name && validFrom && validUntil ? { name, validFrom, validUntil } : null;

  await applyTemplateProposal(
    db,
    uploadId,
    selectieUit(formData),
    newList,
    await getActor(),
  );

  herlaadMerkschermen(brandId);
  redirect(`/data/brand-relations/${brandId}`);
}

// ── 3. Afwijzen ─────────────────────────────────────────────────────────────

/**
 * Geen catalogus-write en GEEN relatiestatus-wijziging (besluit 6): er ís geleverd, het is
 * alleen niet bruikbaar — de status blijft 'data_ontvangen'. 'afgewezen' betekent "merk wil
 * niet meewerken" en mag alleen een mens via het relatieformulier zetten.
 */
export async function rejectTemplateProposalAction(formData: FormData) {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const uploadId = String(formData.get("uploadId") ?? "").trim();
  if (!brandId || !uploadId) return;

  const note = String(formData.get("reviewNote") ?? "").trim();
  await rejectTemplateProposal(db, uploadId, await getActor(), note);

  herlaadMerkschermen(brandId);
  redirect(`/data/brand-relations/${brandId}`);
}
