"use server";

// Server action voor het genereren van een substitutievoorstel (F-06/07/08). De
// werkvoorbereiding-tab levert de knop "Genereer substitutievoorstel" met de referentie +
// het gekozen alternatief; deze action legt het document vast en stuurt door naar de
// printbare pagina. createSubstitution schrijft het prijsverschil alléén als tekst (F-08) —
// prijs beïnvloedt nooit een ordening (regel 2).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { createSubstitution } from "@/lib/repo/substitution";
import { getActor, requireSession } from "@/lib/session";

export async function generateSubstitutionAction(formData: FormData) {
  await requireSession();
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  const referenceProductId = String(
    formData.get("referenceProductId") ?? "",
  ).trim();
  const alternativeProductId = String(
    formData.get("alternativeProductId") ?? "",
  ).trim();
  const specLineId = String(formData.get("specLineId") ?? "").trim() || undefined;
  if (!dossierId || !referenceProductId || !alternativeProductId) return;

  const proposal = await createSubstitution(db, {
    dossierId,
    specLineId,
    referenceProductId,
    alternativeProductId,
    actor: await getActor(),
  });

  revalidatePath(`/projects/${dossierId}/work-prep`);
  redirect(`/projects/${dossierId}/substitution/${proposal.id}`);
}
