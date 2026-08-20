"use server";

// Projecten verwijderen — bewust een EIGEN bestand naast actions.ts: een parallelle
// sessie werkt daar ongecommit in (afspraak 20 aug), en deze action heeft niets met de
// rest gemeen. De vorm is verder de standaard: bewaakProject() → parseForm() → repo
// (docs/INVOERVALIDATIE.md); projects-poort.test.ts dwingt de poort ook hier af.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { bewaakProject } from "@/lib/project-poort";
import { deleteDossiers } from "@/lib/repo/dossier-delete";
import { getActor } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { zTrimmed } from "@/lib/validation";
import { parseForm } from "@/lib/validation";

// Bulk-ids als één komma-gescheiden veld, zelfde vorm als de merkrelaties-bulkactie
// (app/brand-management/actions.ts). Niet-uuid-fragmenten vallen er stil uit; een
// leeg resultaat is "niets te doen", geen fout.
const deleteSchema = z.object({
  dossierIds: zTrimmed.transform((s) =>
    s
      .split(",")
      .map((deel) => deel.trim())
      .filter(isUuid),
  ),
});

/**
 * Verwijdert één of meer projecten definitief (cascade + leads-detach + event per
 * project — lib/repo/dossier-delete.ts). De repo herhaalt scope én rechten per id;
 * hier alleen de poort en de vormcontrole.
 */
export async function deleteProjectsAction(formData: FormData): Promise<void> {
  const { toegang } = await bewaakProject(formData);
  const parsed = parseForm(deleteSchema, formData);
  if (!parsed.ok || parsed.data.dossierIds.length === 0) return;
  await deleteDossiers(db, toegang, parsed.data.dossierIds, await getActor());
  revalidatePath("/projects");
  // Ook de enkel-delete vanaf de projectpagina landt hier: die pagina bestaat nu niet
  // meer, dus altijd terug naar de lijst.
  redirect("/projects");
}
