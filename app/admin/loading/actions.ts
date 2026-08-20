"use server";

// Server-acties van de inlaadwachtrij. Verhuisd uit app/data/actions.ts toen de
// Data-werkbank uit de hoofdnavigatie verdween (IA-opschoning 12 aug): het scherm hangt
// nu onder /admin, en zijn acties horen ernaast te staan in plaats van in een gedeelde
// bak die alleen nog bestond omdat /data er ooit was.
//
// Volgorde conform docs/INVOERVALIDATIE.md: poort → parse → repo.
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dismissBrandLoad, markBrandLoaded } from "@/lib/repo/enrichment";
import { getActor } from "@/lib/session";
import { bewaakNiveau } from "@/lib/route-toegang";
import { parseForm, z, zUuid } from "@/lib/validation";

// UUID-GUARD (bug #1, commit 8811d95 "Uuid-guard sluitend"). `brand_load_queue.id` is een
// uuid-kolom: gaat er iets anders in `eq(...)`, dan gooit Postgres `invalid input syntax
// for type uuid` (22P02), die fout wordt nergens afgevangen en de gebruiker krijgt een 500.
// Bij een server-action is het formveld gewoon POST-body — een handmatige of kapotte
// submit is dus geen theorie. Een niet-uuid is hier geen fout maar een no-op: er ís geen
// rij die zo heet, en de knop hoort dan simpelweg niets te doen.
const wachtrijRegel = z.object({ queueId: zUuid });

export async function markLoadedAction(formData: FormData) {
  await bewaakNiveau("intern", "/admin/loading");
  const parsed = parseForm(wachtrijRegel, formData);
  if (!parsed.ok) return;
  await markBrandLoaded(db, parsed.data.queueId, await getActor());
  revalidatePath("/admin/loading");
}

// "Not a brand" (UX-audit 30 jul, bug #12): zoneteksten die de parser als merk las horen
// niet op de inlaadwachtrij. Afvoeren, niet als ingeladen markeren — dat zou onwaar zijn.
export async function dismissBrandLoadAction(formData: FormData) {
  await bewaakNiveau("intern", "/admin/loading");
  const parsed = parseForm(wachtrijRegel, formData);
  if (!parsed.ok) return;
  await dismissBrandLoad(db, parsed.data.queueId, await getActor());
  revalidatePath("/admin/loading");
  // /analytics leest brand_load_queue ook (de inlaad-tegel). Zonder deze regel bleef die
  // tegel het afgevoerde merk tonen tot de cache vanzelf verliep.
  revalidatePath("/analytics");
}
