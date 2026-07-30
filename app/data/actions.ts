"use server";

// Server-acties voor de data-werkbank (run 5). Elke actie leest zijn velden uit FormData,
// vereist een sessie, en delegeert naar lib/repo/enrichment (+ evaluation). Muteren gebeurt
// alleen hier via de repo-laag; de pagina's blijven puur lezend.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  dismissBrandLoad,
  markBrandLoaded,
  publishRun,
  rejectRun,
  setSampleVerdict,
  startEnrichmentRun,
} from "@/lib/repo/enrichment";
import { measureHitRate } from "@/lib/repo/evaluation";
import { getActor, requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

export async function startRunAction(formData: FormData) {
  await requireSession();
  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return;
  const run = await startEnrichmentRun(db, brandId, await getActor());
  redirect(`/data/enrichment/${run.id}`);
}

export async function setVerdictAction(formData: FormData) {
  await requireSession();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  const verdict = formData.get("verdict") === "fout" ? "fout" : "goed";
  if (!itemId) return;
  await setSampleVerdict(db, itemId, verdict);
  if (runId) revalidatePath(`/data/enrichment/${runId}`);
}

export async function publishRunAction(formData: FormData) {
  await requireSession();
  const runId = String(formData.get("runId") ?? "").trim();
  if (!runId) return;
  await publishRun(db, runId, await getActor());
  revalidatePath("/data/enrichment");
  revalidatePath("/data");
  redirect("/data/enrichment");
}

export async function rejectRunAction(formData: FormData) {
  await requireSession();
  const runId = String(formData.get("runId") ?? "").trim();
  if (!runId) return;
  await rejectRun(db, runId, await getActor());
  revalidatePath("/data/enrichment");
  redirect("/data/enrichment");
}

// UUID-GUARD (bug #1, commit 8811d95 "Uuid-guard sluitend"). `brand_load_queue.id` is een
// uuid-kolom: gaat er iets anders in `eq(...)`, dan gooit Postgres `invalid input syntax
// for type uuid` (22P02), die fout wordt nergens afgevangen en de gebruiker krijgt een 500.
// Bij een server-action is het formveld gewoon POST-body — een handmatige of kapotte
// submit is dus geen theorie. Een niet-uuid is hier geen fout maar een no-op: er ís geen
// rij die zo heet, en de knop hoort dan simpelweg niets te doen.
function queueIdFrom(formData: FormData): string | null {
  const raw = String(formData.get("queueId") ?? "").trim();
  return isUuid(raw) ? raw : null;
}

export async function markLoadedAction(formData: FormData) {
  await requireSession();
  const queueId = queueIdFrom(formData);
  if (!queueId) return;
  await markBrandLoaded(db, queueId, await getActor());
  revalidatePath("/data/loading");
  revalidatePath("/data");
}

// "Not a brand" (UX-audit 30 jul, bug #12): zoneteksten die de parser als merk las horen
// niet op de inlaadwachtrij. Afvoeren, niet als ingeladen markeren — dat zou onwaar zijn.
export async function dismissBrandLoadAction(formData: FormData) {
  await requireSession();
  const queueId = queueIdFrom(formData);
  if (!queueId) return;
  await dismissBrandLoad(db, queueId, await getActor());
  revalidatePath("/data/loading");
  revalidatePath("/data");
  // /analytics leest brand_load_queue ook (de inlaad-tegel). Zonder deze regel bleef die
  // tegel het afgevoerde merk tonen tot de cache vanzelf verliep.
  revalidatePath("/analytics");
}

export async function measureAction(formData: FormData) {
  await requireSession();
  const label =
    String(formData.get("label") ?? "").trim() ||
    `meting ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  await measureHitRate(db, label);
  revalidatePath("/data/evaluation");
}
