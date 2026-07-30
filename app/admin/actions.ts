"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { approveUpload, recordPdlImport, rejectUpload } from "@/lib/repo/admin";
import { getActor, requireSession } from "@/lib/session";

// setTierAction/setFieldVisibilityAction verhuisden naar
// app/data/brand-relations/actions.ts (sprint 2.0a, blok 3): zichtbaarheid (disclosure)
// leeft nu bij de merkrelatie, niet meer in Admin.

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
