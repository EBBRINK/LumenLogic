"use server";

// De meting van de matcher-hitrate. Verhuisd uit app/data/actions.ts toen de
// Data-werkbank uit de hoofdnavigatie verdween (IA-opschoning 12 aug).
//
// Volgorde conform docs/INVOERVALIDATIE.md: poort → parse → repo.
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { measureHitRate } from "@/lib/repo/evaluation";
import { bewaakNiveau } from "@/lib/route-toegang";
import { parseForm, z, zTrimmed } from "@/lib/validation";

const metingRegel = z.object({ label: zTrimmed.default("") });

export async function measureAction(formData: FormData) {
  await bewaakNiveau("intern", "/admin/evaluation");
  const parsed = parseForm(metingRegel, formData);
  // Een lege of ongeldige naam is geen reden om de meting te weigeren: hij krijgt de
  // datum als naam, precies zoals hiervoor.
  const ingevuld = parsed.ok ? parsed.data.label : "";
  const label =
    ingevuld ||
    `meting ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  await measureHitRate(db, label);
  revalidatePath("/admin/evaluation");
}
