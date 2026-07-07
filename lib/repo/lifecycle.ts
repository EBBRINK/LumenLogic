// Dossier-lifecycle (A-05, statemachine §4.8). Naast de fase (tender/gegund):
//   actief → delivered (armaturenboek overgedragen; read-only)
//   actief → archived (verloren/vervallen, reden VERPLICHT — een verloren tender is data)
//   delivered → archived (afgerond)
// Een gearchiveerd of opgeleverd dossier is read-only: de UI blokkeert schrijfacties.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { projectDossiers } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type Lifecycle = "actief" | "delivered" | "archived";

export function isReadOnly(lifecycle: Lifecycle): boolean {
  return lifecycle === "delivered" || lifecycle === "archived";
}

export async function setLifecycle(
  db: AppDb,
  input: {
    dossierId: string;
    lifecycle: Lifecycle;
    reason?: string | null;
    actor?: string;
  },
) {
  if (input.lifecycle === "archived" && !input.reason?.trim()) {
    throw new Error("Reden verplicht bij archiveren");
  }
  const patch: Record<string, unknown> = {
    lifecycle: input.lifecycle,
    updatedAt: new Date(),
  };
  if (input.lifecycle === "delivered") patch.deliveredAt = new Date();
  if (input.lifecycle === "archived") {
    patch.archivedAt = new Date();
    patch.archivedReason = input.reason ?? null;
  }
  if (input.lifecycle === "actief") {
    // heropenen: markeringen wissen
    patch.archivedAt = null;
    patch.archivedReason = null;
    patch.deliveredAt = null;
  }
  await db
    .update(projectDossiers)
    .set(patch)
    .where(eq(projectDossiers.id, input.dossierId));
  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "lifecycle_changed",
    actor: input.actor,
    payload: { lifecycle: input.lifecycle, reason: input.reason ?? null },
  });
}

// Dossierlijst met fase-/lifecycle-filter (§3.2-3): Alle / Tender / Gegund /
// Opgeleverd / Archief. Standaard verbergt archived (die staan onder "Archief").
export async function listDossiersFiltered(
  db: AppDb,
  filter?: "alle" | "tender" | "gegund" | "opgeleverd" | "archief",
) {
  const f = filter ?? "alle";
  const conds = [];
  if (f === "tender") conds.push(eq(projectDossiers.phase, "tender"));
  if (f === "gegund") conds.push(eq(projectDossiers.phase, "awarded"));
  if (f === "opgeleverd") conds.push(eq(projectDossiers.lifecycle, "delivered"));
  if (f === "archief") conds.push(eq(projectDossiers.lifecycle, "archived"));
  // Zonder expliciet archief-filter tonen we alleen niet-gearchiveerde dossiers.
  if (f !== "archief") conds.push(inArray(projectDossiers.lifecycle, ["actief", "delivered"]));

  return db
    .select()
    .from(projectDossiers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(projectDossiers.updatedAt), asc(projectDossiers.createdAt));
}
