"use server";

// De server-actions van het template-pad. Sinds de koerswijziging van 11 aug 2026
// (docs/goal-template-upload-direct-import.md) is uploaden een DIRECTE import met
// vervang-semantiek: valideren (1.1, ongewijzigd) en meteen in batches toepassen — geen
// staging, geen voorstel-scherm. De goedkeur-/afwijs-actions eronder horen bij het oude
// staging-pad; dat blijft bewust staan voor 4.B (merkportaal) en bedient uploads die
// vóór de koerswijziging al op staging stonden.
//
// DEZE LAAG SCHRIJFT NIETS ZELF. Hij leest FormData, bewaakt de grenzen die alleen hier te
// bewaken zijn (sessie, cap) en geeft het door aan lib/repo/template-return.ts. Elke event
// die de catalogus raakt wordt daar gelogd, bij de schrijf zelf — niet hier, want een
// action die logt maar niet schrijft liegt bij een crash ertussenin.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { TemplateUploadState } from "@/components/data/template-upload-card";
import {
  MAX_TEMPLATE_UPLOAD_BYTES,
  MAX_TEMPLATE_UPLOAD_ROWS,
  templateCapMelding,
  templateRijCapMelding,
} from "@/components/data/template-upload-limits";
import { validateFilledTemplateXlsx } from "@/lib/excel-validate";
import { afwijzingsTekst } from "@/lib/excel-validate-messages";
import { laadCatalogus } from "@/lib/repo/custom-fields";
import { logEvent } from "@/lib/repo/events";
import {
  applyTemplateProposal,
  loadBestaandeProducten,
  rejectTemplateProposal,
  type PriceListInput,
} from "@/lib/repo/template-return";
import {
  importTemplateDirect,
  TemplateImportError,
} from "@/lib/repo/template-import";
import type { ApplySelection } from "@/lib/template-diff";
import { getActor } from "@/lib/session";
import { parseForm, z, zTrimmed, zUuid } from "@/lib/validation";
import { applySummaryQuery } from "./apply-summary";
import { importSummaryQuery } from "./import-summary";
import { bewaakNiveau } from "@/lib/route-toegang";

/** Na een schrijf: het merkrelatie-scherm toont de open uploads en de relatiestatus, het
 *  overzicht telt de statussen. Zelfde set als actions.ts. */
function herlaadMerkschermen(brandId: string) {
  revalidatePath(`/brand-management/${brandId}`);
  revalidatePath("/brand-management");
}

// ── 1. Uploaden = importeren ────────────────────────────────────────────────

/** 'YYYY-MM-DD' én een bestaande kalenderdatum — zelfde strengheid als
 *  extendPriceListValidity: '2026-02-30' zou anders stil doorrollen naar 03-02. */
const zIsoDatum = zTrimmed.refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "geen geldige datum (YYYY-MM-DD)");

/** De vier invoervelden van de upload-kaart. Het bestand zelf blijft File; de inhoud
 *  beoordeelt de 1.1-validator, niet zod. */
const uploadSchema = z.object({
  brandId: zUuid,
  priceListName: zTrimmed.min(1, "verplicht"),
  priceListValidFrom: zIsoDatum,
  priceListValidUntil: zIsoDatum,
  template: z.instanceof(File),
});

/**
 * Valideert een ingevulde template en past hem bij succes DIRECT toe (vervang-semantiek,
 * docs/goal-template-upload-direct-import.md): geen staging-rij, geen voorstel-scherm.
 * Komt nooit met een "ok" terug: bij een geslaagde import redirect hij naar het merkscherm
 * met de tellingen in de querystring (import-summary.tsx).
 */
export async function uploadTemplateAction(
  _prev: TemplateUploadState,
  formData: FormData,
): Promise<TemplateUploadState> {
  await bewaakNiveau("intern", "/brand-management/[brandId]");

  const parsed = parseForm(uploadSchema, formData);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const { brandId, template: file } = parsed.data;
  const newList = {
    name: parsed.data.priceListName,
    validFrom: parsed.data.priceListValidFrom,
    validUntil: parsed.data.priceListValidUntil,
  };
  if (file.size === 0) {
    return { status: "error", message: "Choose the filled template (.xlsx) first." };
  }
  if (newList.validUntil < newList.validFrom) {
    // Datums als tekst vergelijken mag: 'YYYY-MM-DD' is lexicografisch = chronologisch.
    return {
      status: "error",
      message: "The price list end date is before its start date.",
    };
  }

  // DE BYTE-CAP IS DE EERSTE BESTANDSCHECK EN DE GEZAGHEBBENDE (besluit 7). De kaart checkt
  // hem ook, maar dat is een dienst aan de gebruiker, geen grens: een request komt hier ook
  // zonder die kaart binnen. Vóór arrayBuffer(), want die trekt het bestand het geheugen in.
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

  // RIJ-CAP: een transportgrens naast de validator, geen format-oordeel — zie
  // template-upload-limits.ts. Pas ná de validatie te checken, want de validator kent het
  // rijental als eerste (alleen écht ingevulde rijen tellen).
  if (resultaat.rijen.length > MAX_TEMPLATE_UPLOAD_ROWS) {
    await logEvent(db, {
      entity: "brand",
      entityId: brandId,
      action: "template_upload_too_many_rows",
      actor: await getActor(),
      payload: {
        filename: file.name,
        rijen: resultaat.rijen.length,
        cap: MAX_TEMPLATE_UPLOAD_ROWS,
      },
    });
    return { status: "error", message: templateRijCapMelding(resultaat.rijen.length) };
  }

  // DIRECT TOEPASSEN — geen staging-jsonb, geen voorstel-scherm. De repo-laag logt zelf
  // (template_import_started/…_finished + per-veld-events) en zet de relatiestatus.
  let uitkomst;
  try {
    uitkomst = await importTemplateDirect(db, {
      brandId,
      rijen: resultaat.rijen,
      waarschuwingen: resultaat.waarschuwingen,
      filename: file.name,
      fileSize: file.size,
      newList,
      actor: await getActor(),
    });
  } catch (e) {
    if (e instanceof TemplateImportError && e.code === "no_prices") {
      // Voorspelbare invoerfout, vóór de eerste schrijf geweigerd: zonder één verwerkbare
      // prijs zou de lijst-wissel het hele merk onzichtbaar maken.
      return {
        status: "error",
        message:
          "This file contains no usable prices. Replacing the price list would hide every product of this brand, so nothing has been imported. Check the 'List price (excl. VAT)' column.",
      };
    }
    throw e;
  }

  herlaadMerkschermen(brandId);
  redirect(`/brand-management/${brandId}?${importSummaryQuery(uitkomst)}`);
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
  await bewaakNiveau("intern", "/brand-management/[brandId]");
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

  const uitkomst = await applyTemplateProposal(
    db,
    uploadId,
    selectieUit(formData),
    newList,
    await getActor(),
  );

  herlaadMerkschermen(brandId);
  // C8: de zes tellingen reizen mee met de redirect die er toch al was, zodat het
  // doelscherm ze kan tonen op het moment dat de gebruiker kijkt. Ze VERVANGEN het
  // eventspoor niet — template_apply_finished blijft de bron van waarheid (zie
  // apply-summary.tsx). Faalt de codering om welke reden dan ook, dan redirecten we
  // zoals voorheen: de samenvatting is een extraatje, nooit een blokkade.
  const query = applySummaryQuery(
    uitkomst.alreadyProcessed
      ? { kind: "already" }
      : { kind: "done", ...uitkomst },
  );
  redirect(`/brand-management/${brandId}${query ? `?${query}` : ""}`);
}

// ── 3. Afwijzen ─────────────────────────────────────────────────────────────

/**
 * Geen catalogus-write en GEEN relatiestatus-wijziging (besluit 6): er ís geleverd, het is
 * alleen niet bruikbaar — de status blijft 'data_ontvangen'. 'afgewezen' betekent "merk wil
 * niet meewerken" en mag alleen een mens via het relatieformulier zetten.
 */
export async function rejectTemplateProposalAction(formData: FormData) {
  await bewaakNiveau("intern", "/brand-management/[brandId]");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const uploadId = String(formData.get("uploadId") ?? "").trim();
  if (!brandId || !uploadId) return;

  const note = String(formData.get("reviewNote") ?? "").trim();
  await rejectTemplateProposal(db, uploadId, await getActor(), note);

  herlaadMerkschermen(brandId);
  redirect(`/brand-management/${brandId}`);
}
