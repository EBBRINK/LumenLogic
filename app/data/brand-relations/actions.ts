"use server";

// Server-actie voor merkrelaties: leest velden uit FormData, vereist een sessie en
// delegeert naar upsertBrandRelation (de enige schrijver, K2) — die logt zelf de
// events (K7, regel 5). Alleen aanwezige velden komen in de patch (partial update).
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import type { BrandRelationStatus } from "@/db/schema";
import {
  bulkSetBrandRelationStatus,
  upsertBrandRelation,
  type BrandRelationPatch,
} from "@/lib/repo/brand-relations";
import { setBrandFieldOverride, setBrandTier } from "@/lib/repo/admin";
import type { DisclosureTier } from "@/lib/repo/disclosure";
import { logEvent } from "@/lib/repo/events";
import { getActor } from "@/lib/session";
import { bewaakNiveau } from "@/lib/route-toegang";

const TIERS: DisclosureTier[] = ["tier1", "tier2", "tier3"];

const STATUSSEN: BrandRelationStatus[] = [
  "niet_benaderd",
  "benaderd",
  "wacht_op_data",
  "data_ontvangen",
  "verwerkt",
  "afgewezen",
];

export async function updateBrandRelationAction(formData: FormData) {
  await bewaakNiveau("intern", "/data/brand-relations");
  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return;

  const patch: BrandRelationPatch = {};
  const status = formData.get("status");
  if (typeof status === "string") {
    if (!STATUSSEN.includes(status as BrandRelationStatus)) return;
    patch.status = status as BrandRelationStatus;
  }
  // Tekstvelden: alleen meesturen als het formulier ze bevat; leeg = leegmaken (null).
  for (const key of ["contactName", "contactEmail", "notes"] as const) {
    const v = formData.get(key);
    if (typeof v === "string") patch[key] = v.trim() || null;
  }
  const lastContactAt = formData.get("lastContactAt");
  if (typeof lastContactAt === "string") {
    patch.lastContactAt = lastContactAt.trim() || null;
  }
  if (Object.keys(patch).length === 0) return;

  await upsertBrandRelation(db, brandId, patch, await getActor());
  revalidatePath("/data/brand-relations");
  revalidatePath(`/data/brand-relations/${brandId}`);
  revalidatePath("/data");
}

// BULK-STATUS (UX-audit 30 jul, bak 2 item 10). Komt uit ConfirmActionDialog, dus als
// gewone form-submit: één verborgen veld met de merk-id's, komma-gescheiden.
//
// Waarom een harde bovengrens: de selectie in de UI kan nooit groter zijn dan één pagina
// (BRAND_RELATIONS_PAGE_SIZE = 25), maar dit is een POST-endpoint en het schrijfpad logt
// per merk een event. Zonder grens kan één verzoek de hele merkentabel plus 438 events
// schrijven. 100 laat elke echte selectie door en houdt de ondergrens van de schade vast.
const BULK_MAX = 100;

export async function bulkSetBrandRelationStatusAction(formData: FormData) {
  await bewaakNiveau("intern", "/data/brand-relations");
  const status = String(formData.get("status") ?? "").trim();
  if (!STATUSSEN.includes(status as BrandRelationStatus)) return;

  const brandIds = String(formData.get("brandIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (brandIds.length === 0 || brandIds.length > BULK_MAX) return;

  await bulkSetBrandRelationStatus(
    db,
    brandIds,
    status as BrandRelationStatus,
    await getActor(),
  );
  revalidatePath("/data/brand-relations");
  for (const brandId of brandIds) {
    revalidatePath(`/data/brand-relations/${brandId}`);
  }
  revalidatePath("/data");
}

// K7/regel 5: 'brand_message_prepared' loggen we bij de expliciete gebruikersactie
// (kopiëren), niet bij elke page-render — dat zou de events-tabel vervuilen met ruis
// (zelfde afweging als brand_template_downloaded: pas bij de download zelf).
export async function logBrandMessagePreparedAction(brandId: string) {
  await bewaakNiveau("intern", "/data/brand-relations");
  if (!brandId) return;
  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "brand_message_prepared",
    actor: await getActor(),
  });
}

// Verhuisd uit app/admin/actions.ts (sprint 2.0a, blok 3): zichtbaarheid (disclosure)
// leeft nu bij de merkrelatie, niet meer in Admin. De onderliggende repo-functies
// setBrandTier/setBrandFieldOverride (lib/repo/admin.ts) loggen zelf hun events
// (brand_tier_changed / brand_field_visibility_changed, ijzeren regel 5) — dat blijft
// ongewijzigd, hier verandert alleen waar de actie-wrapper vandaan komt.

// MERK-TIER zetten (J-02). Ongeldige waarde → geen wijziging (fail-safe).
export async function setTierAction(formData: FormData) {
  await bewaakNiveau("intern", "/data/brand-relations");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const tier = String(formData.get("tier") ?? "").trim() as DisclosureTier;
  if (!brandId || !TIERS.includes(tier)) return;
  await setBrandTier(db, brandId, tier, await getActor());
  revalidatePath("/data/brand-relations");
  revalidatePath(`/data/brand-relations/${brandId}`);
}

// PER-VELD-ZICHTBAARHEID (J-04): expliciete override op de tier-basis.
export async function setFieldVisibilityAction(formData: FormData) {
  await bewaakNiveau("intern", "/data/brand-relations");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  if (!brandId || !field) return;
  const visible = String(formData.get("visible") ?? "") === "true";
  await setBrandFieldOverride(db, brandId, field, visible, await getActor());
  revalidatePath(`/data/brand-relations/${brandId}`);
}
