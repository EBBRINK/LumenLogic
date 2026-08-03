"use server";

// Server action voor de XIS-push (E-09…E-12). De human tikt op "Verstuur naar XIS";
// createXisExport is idempotent op dossier-id, dus opnieuw versturen maakt geen
// duplicaat. Sandbox is default (NFR 7). De echte Lynx-POST bestaat nog niet — deze
// export legt het snapshot vast in xis_exports; een downloadbaar bestand is (nog) niet
// vereist, alleen de administratie + bevestiging.
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { getEstimateData } from "@/lib/repo/estimate";
import { createXisExport } from "@/lib/repo/xis";
import { getActor } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { bewaakProject } from "@/lib/project-poort";

export async function xisExportAction(formData: FormData) {
  const { scope } = await bewaakProject(formData);
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  if (!dossierId) return;
  // Uuid-guard: dossierId komt uit een verborgen formulierveld en gaat zo een
  // uuid-kolom in — een gerommelde waarde moet geen 500 uit de database opleveren.
  if (!isUuid(dossierId)) return;

  // Kopblokpoort, serverkant (herstel 2026-07-30). De PDF-route had een echte 409, de
  // XIS-push had alleen een verborgen knop — en een verborgen knop is geen poort: een
  // handgemaakte POST stuurde het onvolledige stuk alsnog door. Zelfde bron als de
  // pagina en de PDF-route, dus een bevroren (al uitgestuurde) offerte komt er wél
  // door: die IS het klantstuk. Stil terug, geen throw — de UI biedt deze knop in
  // deze stand niet aan, dus dit is een vangrail, geen gebruikerspad.
  const data = await getEstimateData(db, scope, dossierId);
  if (!data || !data.computed.outputsAllowed) return;

  const environment =
    formData.get("environment") === "production" ? "production" : "sandbox";
  await createXisExport(db, scope, {
    dossierId,
    environment,
    actor: await getActor(),
  });
  revalidatePath(`/projects/${dossierId}/quote`);
}
