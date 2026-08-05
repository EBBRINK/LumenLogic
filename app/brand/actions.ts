"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  refreshBrandAggregates,
  submitBrandUpload,
} from "@/lib/repo/brand-portal";
import { getActor } from "@/lib/session";
import { bewaakNiveau } from "@/lib/route-toegang";

// Prijslijst aanleveren (H-11): één publicatiepad. De upload landt op 'staging' en wacht op
// goedkeuring — nooit direct in de catalogus. valid_until is verplicht; de repo weigert een
// prijslijst zonder einddatum (ijzeren regel 3). We slaan hier stil over als het veld
// ontbreekt zodat de required-attributen in de UI de eerste poort zijn.
export async function submitUploadAction(formData: FormData) {
  await bewaakNiveau("intern", "/brand");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const validUntil = String(formData.get("validUntil") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!brandId || !validUntil) return;
  await submitBrandUpload(db, {
    brandId,
    kind: "pricelist",
    payload: { valid_until: validUntil, name: name || null },
    submittedBy: await getActor(),
  });
  revalidatePath("/brand/price-lists");
}

// K-05: de geaggregeerde cijfers zijn een materialized view; verversen is expliciet.
export async function refreshAggregatesAction() {
  await bewaakNiveau("intern", "/brand");
  await refreshBrandAggregates(db);
  revalidatePath("/brand/dashboard");
}
