// UI-naam: Project. DB/code-naam blijft 'dossier' (bewust, zie docs/plan-aanvraag-estimate.md B1).
// B6 + bouwstap 4: het status- en fasemodel, met ÉÉN schrijver voor `phase`.
//
//   status (commercieel): concept → estimate_gestuurd → offerte → gegund | niet_gegund → archief
//   xis_phase (taal van Brink): start … aftersales, win/lost
//   phase (veiligheidsschakelaar, regel 4): AFGELEID — awarded alléén bij status 'gegund'
//   óf xis_phase ∈ {deal_making, deliver, aftersales, win}; anders tender (default veilig).
//
// `phase` wordt uitsluitend hier geschreven (setStatus/setXisPhase/createDossier via
// derivePhase) — de phase-toggle en setDossierPhase zijn verwijderd (geen tweede waarheid).
// Elke wijziging wordt gelogd (regel 5), met `phase_changed` in de payload zodra de
// afgeleide fase mee verschoof.
//
// Read-only is er alléén bij status 'archief' (bewust besluit B6: bestaande "opgeleverde"
// dossiers zijn weer bewerkbaar). De lifecycle-kolom blijft bestaan maar is deprecated en
// wordt hier níét meer beschreven; alle gedrag draait op status.
//
// deliveredAt: bewust GENEGEERD bij status 'gegund'. Het veld hoorde bij het oude
// lifecycle-begrip "opgeleverd" (armaturenboek overgedragen) — dat is iets anders dan
// gunning, en het moment van gunnen staat al in het status_changed-event. De kolom blijft,
// net als lifecycle, deprecated staan.
import { asc, desc, eq, ne } from "drizzle-orm";
import {
  projectDossiers,
  quotes,
  type ProjectStatus,
  type XisPhase,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type Phase = "tender" | "awarded";
export type { ProjectStatus, XisPhase };

export const PROJECT_STATUSES: ProjectStatus[] = [
  "concept",
  "estimate_gestuurd",
  "offerte",
  "gegund",
  "niet_gegund",
  "archief",
];

export const XIS_PHASES: XisPhase[] = [
  "start",
  "engineering",
  "calculations",
  "presenting",
  "tender",
  "deal_making",
  "deliver",
  "aftersales",
  "win",
  "lost",
];

// XIS-fasen waarin het project feitelijk gegund is → alternatieven-suggesties mogen aan.
const AWARDED_XIS_PHASES: readonly XisPhase[] = [
  "deal_making",
  "deliver",
  "aftersales",
  "win",
];

// De afgeleide veiligheidsschakelaar (regel 4). Puur en deterministisch: awarded alléén
// bij status 'gegund' óf een XIS-fase ná de tender; alles anders = tender (default veilig).
export function derivePhase(status: ProjectStatus, xisPhase: XisPhase): Phase {
  if (status === "gegund") return "awarded";
  if (AWARDED_XIS_PHASES.includes(xisPhase)) return "awarded";
  return "tender";
}

// Read-only alléén bij archief (B6): een niet-gegund project blijft bewerkbaar — het is
// data waar je nog in wilt kunnen werken, geen bevroren verleden.
export function isReadOnly(status: ProjectStatus): boolean {
  return status === "archief";
}

async function getRow(db: AppDb, dossierId: string) {
  const [row] = await db
    .select()
    .from(projectDossiers)
    .where(eq(projectDossiers.id, dossierId))
    .limit(1);
  if (!row) throw new Error("Project not found");
  return row;
}

// Statuswijziging: status + afgeleide phase in ÉÉN update, event erbij (regel 5).
// • archief: reden VERPLICHT (een verloren tender is data) → archivedReason/archivedAt.
// • weg uit archief (heropenen): archiveringsmarkeringen wissen.
// • estimate_gestuurd: bestaande, nog niet bevroren estimate wordt bevroren (I-06) + event.
export async function setStatus(
  db: AppDb,
  dossierId: string,
  status: ProjectStatus,
  actor?: string,
  opts?: { reason?: string | null },
) {
  const current = await getRow(db, dossierId);
  if (status === "archief" && !opts?.reason?.trim()) {
    throw new Error("Reason required when archiving");
  }

  const phase = derivePhase(status, current.xisPhase);
  const patch: Record<string, unknown> = {
    status,
    phase,
    updatedAt: new Date(),
  };
  if (status === "archief") {
    patch.archivedAt = new Date();
    patch.archivedReason = opts?.reason ?? null;
  } else if (current.status === "archief") {
    // heropenen: markeringen wissen
    patch.archivedAt = null;
    patch.archivedReason = null;
  }
  await db
    .update(projectDossiers)
    .set(patch)
    .where(eq(projectDossiers.id, dossierId));

  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "status_changed",
    actor,
    payload: {
      from: current.status,
      to: status,
      reason: opts?.reason ?? null,
      ...(phase !== current.phase
        ? { phase_changed: { from: current.phase, to: phase } }
        : {}),
    },
  });

  // Estimate gestuurd → kopblok + aantallen op slot (I-06), gelogd.
  if (status === "estimate_gestuurd") {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.dossierId, dossierId))
      .orderBy(asc(quotes.createdAt))
      .limit(1);
    if (quote && !quote.frozenAt) {
      await db
        .update(quotes)
        .set({ frozenAt: new Date(), updatedAt: new Date() })
        .where(eq(quotes.id, quote.id));
      await logEvent(db, {
        entity: "quote",
        entityId: quote.id,
        action: "quote_frozen",
        actor,
        payload: { dossierId, trigger: "status_estimate_gestuurd" },
      });
    }
  }
}

// XIS-fasewijziging: xis_phase + afgeleide phase in ÉÉN update, event erbij (regel 5).
export async function setXisPhase(
  db: AppDb,
  dossierId: string,
  xisPhase: XisPhase,
  actor?: string,
) {
  const current = await getRow(db, dossierId);
  const phase = derivePhase(current.status, xisPhase);
  await db
    .update(projectDossiers)
    .set({ xisPhase, phase, updatedAt: new Date() })
    .where(eq(projectDossiers.id, dossierId));
  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "xis_phase_changed",
    actor,
    payload: {
      from: current.xisPhase,
      to: xisPhase,
      ...(phase !== current.phase
        ? { phase_changed: { from: current.phase, to: phase } }
        : {}),
    },
  });
}

// Projectlijst met statusfilter (vervangt het lifecycle-filter). Zonder filter ("alle")
// tonen we alles behálve archief — gearchiveerd blijft data, bewust onder z'n eigen tab.
export type StatusFilter = "alle" | ProjectStatus;

export async function listDossiersFiltered(
  db: AppDb,
  filter?: StatusFilter,
) {
  const f = filter ?? "alle";
  const where =
    f === "alle"
      ? ne(projectDossiers.status, "archief")
      : eq(projectDossiers.status, f);
  return db
    .select()
    .from(projectDossiers)
    .where(where)
    .orderBy(desc(projectDossiers.updatedAt), asc(projectDossiers.createdAt));
}
