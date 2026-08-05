"use server";

// Server action voor het vastleggen van een armaturenboek-versie (G-02). De human tikt op
// "Nieuwe versie vastleggen"; snapshotArmaturenboek bevriest de huidige regels (product,
// specs, locatie) als een oplopend genummerde versie. Geen outbound actie, geen mutatie van
// de spec-regels zelf — puur een momentopname.
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { snapshotArmaturenboek } from "@/lib/repo/armaturenboek-versions";
import { getActor } from "@/lib/session";
import { bewaakProject } from "@/lib/project-poort";

export async function snapshotAction(formData: FormData) {
  const { scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  if (!dossierId) return;
  const note = String(formData.get("note") ?? "").trim() || null;
  await snapshotArmaturenboek(db, {
    dossierId,
    note,
    actor: await getActor(),
  });
  revalidatePath(`/projects/${dossierId}/luminaire-schedule/versions`);
}
