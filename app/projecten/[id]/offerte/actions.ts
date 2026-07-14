"use server";

// Server action voor de XIS-push (E-09…E-12). De human tikt op "Verstuur naar XIS";
// createXisExport is idempotent op dossier-id, dus opnieuw versturen maakt geen
// duplicaat. Sandbox is default (NFR 7). De echte Lynx-POST bestaat nog niet — deze
// export legt het snapshot vast in xis_exports; een downloadbaar bestand is (nog) niet
// vereist, alleen de administratie + bevestiging.
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createXisExport } from "@/lib/repo/xis";
import { getActor, requireSession } from "@/lib/session";

export async function xisExportAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  if (!dossierId) return;
  const environment =
    formData.get("environment") === "production" ? "production" : "sandbox";
  await createXisExport(db, {
    dossierId,
    environment,
    actor: await getActor(),
  });
  revalidatePath(`/projecten/${dossierId}/offerte`);
}
