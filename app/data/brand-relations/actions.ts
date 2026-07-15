"use server";

// Server-actie voor merkrelaties: leest velden uit FormData, vereist een sessie en
// delegeert naar upsertBrandRelation (de enige schrijver, K2) — die logt zelf de
// events (K7, regel 5). Alleen aanwezige velden komen in de patch (partial update).
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import type { BrandRelationStatus } from "@/db/schema";
import {
  upsertBrandRelation,
  type BrandRelationPatch,
} from "@/lib/repo/brand-relations";
import { logEvent } from "@/lib/repo/events";
import { getActor, requireSession } from "@/lib/session";

const STATUSSEN: BrandRelationStatus[] = [
  "niet_benaderd",
  "benaderd",
  "wacht_op_data",
  "data_ontvangen",
  "verwerkt",
  "afgewezen",
];

export async function updateBrandRelationAction(formData: FormData) {
  await requireSession();
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

// K7/regel 5: 'brand_message_prepared' loggen we bij de expliciete gebruikersactie
// (kopiëren), niet bij elke page-render — dat zou de events-tabel vervuilen met ruis
// (zelfde afweging als brand_template_downloaded: pas bij de download zelf).
export async function logBrandMessagePreparedAction(brandId: string) {
  await requireSession();
  if (!brandId) return;
  await logEvent(db, {
    entity: "brand",
    entityId: brandId,
    action: "brand_message_prepared",
    actor: await getActor(),
  });
}
