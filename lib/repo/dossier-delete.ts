// Projecten verwijderen — onomkeerbaar, gecascadeerd, gelogd (docs/goal-projecten-verwijderen.md).
//
// Model: getBrandDeleteImpact/deleteBrand in lib/repo/brands.ts. Twee verschillen:
//   • hier is er geen blocker-groep — alles onder een project cascadet al in de database
//     (spec_lines → kandidaten/ai_suggestions, quotes → quote_lines, import_runs →
//     ocr_page_images, xis_exports, armaturenboek_versions, substitution_proposals,
//     matchstation_queue). De énige FK zonder ON DELETE is `leads.dossier_id`, en een
//     lead is commercieel spoor, geen projectinhoud: die koppelen we lós in plaats van
//     hem mee het graf in te nemen. Zelfde reden waarom scripts/cleanup-testdata.ts een
//     aparte leads-stap heeft.
//   • rechten staan hier óók in de repo, niet alleen in de UI: verwijderen raakt een
//     klantdocument (de estimate hangt eronder), dus de invariant hoort bij de data.
//     Intern mag alles; extern alleen als org-admin van de org van het project;
//     projecten zonder org zijn alleen voor intern.
//
// Geen transactie: db/client.ts is neon-http en kan er geen (zelfde beperking als het
// cleanup-script). Volgorde per project: leads-detach → DELETE → logEvent. Faalt de
// DELETE, dan zijn hooguit leads al losgekoppeld — geen dataverlies, en het event wordt
// dan níet geschreven (geen spoor van een handeling die niet gebeurde).
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/repo/db";
import { importRuns, leads, projectDossiers, quotes, specLines } from "@/db/schema";
import { logEvent } from "@/lib/repo/events";
import { getDossier } from "@/lib/repo/dossiers";
import {
  toegangScope,
  type DossierScope,
  type Toegang,
} from "@/lib/repo/toegang";

export type DossierDeleteImpact = {
  name: string;
  specLines: number;
  quotes: number;
  importRuns: number;
  leads: number;
};

/**
 * Wat er meegaat (en wat er loskomt) per project, voor de bevestigingsdialoog.
 * Het dossier zelf komt via `getDossier` — één van de vier deuren op project_dossiers
 * (lib/repo/dossier-scope.test.ts); een buiten-scope-id ontbreekt dus gewoon in het
 * antwoord. De tellingen komen per project uit één query met scalaire subquery's op
 * de geïndexeerde dossier_id-kolommen. Per id één rondje is hier prima: de dialoog
 * gaat over een handvol projecten, niet over een lijst van duizend.
 */
export async function getDossierDeleteImpact(
  db: AppDb,
  scope: DossierScope,
  ids: string[],
): Promise<Record<string, DossierDeleteImpact>> {
  const result: Record<string, DossierDeleteImpact> = {};
  for (const id of ids) {
    const dossier = await getDossier(db, scope, id);
    if (!dossier) continue;
    const [row] = await db
      .select({
        specLines: sql<number>`count(*)`.mapWith(Number),
        quotes:
          sql<number>`(select count(*) from ${quotes} q where q.dossier_id = ${id})`.mapWith(
            Number,
          ),
        importRuns:
          sql<number>`(select count(*) from ${importRuns} ir where ir.dossier_id = ${id})`.mapWith(
            Number,
          ),
        leads:
          sql<number>`(select count(*) from ${leads} l where l.dossier_id = ${id})`.mapWith(
            Number,
          ),
      })
      .from(specLines)
      .where(eq(specLines.dossierId, id));
    result[id] = {
      name: dossier.name,
      specLines: row?.specLines ?? 0,
      quotes: row?.quotes ?? 0,
      importRuns: row?.importRuns ?? 0,
      leads: row?.leads ?? 0,
    };
  }
  return result;
}

/** Mag deze toegang dít project verwijderen? Ook de UI gebruikt deze vraag. */
export function magVerwijderen(
  toegang: Toegang,
  dossier: { orgId: string | null },
): boolean {
  if (toegang.soort === "intern") return true;
  return dossier.orgId != null && toegang.adminOrgIds.includes(dossier.orgId);
}

/**
 * Verwijdert projecten definitief. Ids buiten de scope of buiten de rechten worden
 * overgeslagen (geteld in `skipped`), nooit half verwijderd. Per verwijderd project
 * één event `dossier_deleted` met de volledige rij van vóór de delete.
 */
export async function deleteDossiers(
  db: AppDb,
  toegang: Toegang,
  ids: string[],
  actor: string,
): Promise<{ deleted: number; skipped: number }> {
  const scope = toegangScope(toegang);
  let deleted = 0;
  let skipped = 0;
  for (const id of ids) {
    const dossier = await getDossier(db, scope, id);
    if (!dossier || !magVerwijderen(toegang, dossier)) {
      skipped++;
      continue;
    }
    const impact = (await getDossierDeleteImpact(db, scope, [id]))[id];
    const detached = await db
      .update(leads)
      .set({ dossierId: null })
      .where(eq(leads.dossierId, id))
      .returning({ id: leads.id });
    try {
      await db.delete(projectDossiers).where(eq(projectDossiers.id, id));
    } catch {
      // Eén database is dev én prod: een constraint-naam mag nooit naar boven lekken.
      skipped++;
      continue;
    }
    await logEvent(db, {
      entity: "dossier",
      entityId: id,
      action: "dossier_deleted",
      actor,
      payload: {
        dossier,
        cascaded: impact
          ? {
              specLines: impact.specLines,
              quotes: impact.quotes,
              importRuns: impact.importRuns,
            }
          : null,
        leadsDetached: detached.length,
      },
    });
    deleted++;
  }
  return { deleted, skipped };
}
