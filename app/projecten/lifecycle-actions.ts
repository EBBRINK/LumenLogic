"use server";

// Lifecycle-overgangen van een dossier (A-05): markeer als opgeleverd, archiveer (reden
// verplicht) of heropen. setLifecycle logt het event en dwingt de reden af bij archiveren;
// die fout vangen we hier netjes op zodat een lege reden geen crash geeft maar het dossier
// simpelweg ongewijzigd laat (de UI schakelt de knop al uit — dit is het serverside vangnet).
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { setLifecycle, type Lifecycle } from "@/lib/repo/lifecycle";
import { requireSession, getActor } from "@/lib/session";

function asLifecycle(v: FormDataEntryValue | null): Lifecycle | null {
  return v === "actief" || v === "delivered" || v === "archived" ? v : null;
}

export async function setLifecycleAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const lifecycle = asLifecycle(formData.get("lifecycle"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!dossierId || !lifecycle) return;
  try {
    await setLifecycle(db, {
      dossierId,
      lifecycle,
      reason,
      actor: await getActor(),
    });
  } catch {
    // Reden verplicht bij archiveren → geen crash, dossier blijft ongewijzigd.
    revalidatePath(`/projecten/${dossierId}`);
    return;
  }
  revalidatePath(`/projecten/${dossierId}`);
  revalidatePath("/projecten");
}
