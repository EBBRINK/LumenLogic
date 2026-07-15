"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import type { DisclosureTier } from "@/lib/repo/disclosure";
import {
  approveUpload,
  recordPdlImport,
  rejectUpload,
  setBrandFieldOverride,
  setBrandTier,
} from "@/lib/repo/admin";
import { getActor, requireSession } from "@/lib/session";

const TIERS: DisclosureTier[] = ["tier1", "tier2", "tier3"];

// MERK-TIER zetten (J-02). Ongeldige waarde → geen wijziging (fail-safe).
export async function setTierAction(formData: FormData) {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const tier = String(formData.get("tier") ?? "").trim() as DisclosureTier;
  if (!brandId || !TIERS.includes(tier)) return;
  await setBrandTier(db, brandId, tier, await getActor());
  revalidatePath("/admin/brands");
  revalidatePath("/admin");
}

// PER-VELD-ZICHTBAARHEID (J-04): expliciete override op de tier-basis.
export async function setFieldVisibilityAction(formData: FormData) {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  if (!brandId || !field) return;
  const visible = String(formData.get("visible") ?? "") === "true";
  await setBrandFieldOverride(db, brandId, field, visible, await getActor());
  revalidatePath("/admin/brands");
}

// UPLOAD goedkeuren (H-11).
export async function approveUploadAction(formData: FormData) {
  await requireSession();
  const uploadId = String(formData.get("uploadId") ?? "").trim();
  if (!uploadId) return;
  await approveUpload(db, uploadId, await getActor());
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}

// UPLOAD afwijzen — reden verplicht (een afwijzing zonder reden is geen data).
export async function rejectUploadAction(formData: FormData) {
  await requireSession();
  const uploadId = String(formData.get("uploadId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!uploadId || !note) return;
  await rejectUpload(db, uploadId, await getActor(), note);
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}

// PDL / ConnectingTheDots-import als staging-stub (H-10). Landt in de goedkeuringswachtrij,
// nooit direct in de catalogus.
export async function pdlImportAction(formData: FormData) {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return;
  await recordPdlImport(db, {
    brandId,
    payload: { source: "ConnectingTheDots", stagedAt: new Date().toISOString() },
    actor: await getActor(),
  });
  revalidatePath("/admin/imports");
}
