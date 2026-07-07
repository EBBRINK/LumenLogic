// Review-station (masterplan §4 stap 3; functioneel ontwerp §3.7 + flow §4.4).
// De wachtrij = alle regels waar reviewKind ≠ null: geel-review, variantkeuze,
// onvolledig-bevestiging, OCR-controle. Elke beslissing draagt actor + reden (D-06).
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { specLines } from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export async function getReviewQueue(db: AppDb, dossierId: string) {
  const rows = await db
    .select({
      id: specLines.id,
      fixtureCode: specLines.fixtureCode,
      brandText: specLines.brandText,
      productText: specLines.productText,
      status: specLines.status,
      reviewKind: specLines.reviewKind,
      reviewedAt: specLines.reviewedAt,
      reviewedBy: specLines.reviewedBy,
      reviewDecision: specLines.reviewDecision,
      deviations: specLines.deviations,
      reqColor: specLines.reqColor,
      sortOrder: specLines.sortOrder,
    })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId))
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));
  // aanvraagvolgorde (C-11), niet urgentie
  const pending = rows.filter((r) => r.reviewKind && !r.reviewedAt);
  const done = rows.filter((r) => r.reviewKind && r.reviewedAt);
  return { pending, done };
}

// Aantal wachtende review-items (voor de tab-badge ②④).
export async function getReviewCounts(
  db: AppDb,
  dossierId: string,
): Promise<{ pending: number; total: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${specLines.reviewKind} is not null)`,
      pending: sql<number>`count(*) filter (where ${specLines.reviewKind} is not null and ${specLines.reviewedAt} is null)`,
    })
    .from(specLines)
    .where(eq(specLines.dossierId, dossierId));
  return { pending: Number(row?.pending ?? 0), total: Number(row?.total ?? 0) };
}

export type ReviewDecision =
  | "accepteer"
  | "afgewezen"
  | "variant"
  | "gecontroleerd"
  | "bevestigd";

// Eén review-beslissing. Reden verplicht bij afwijzen/overrulen (D-05); optioneel bij
// accepteren. Zet de regelstatus mee waar de beslissing dat vereist.
export async function decideReview(
  db: AppDb,
  input: {
    specLineId: string;
    decision: ReviewDecision;
    reason?: string | null;
    actor?: string;
    variantColor?: string | null;
  },
): Promise<void> {
  if (input.decision === "afgewezen" && !input.reason?.trim()) {
    throw new Error("Reden verplicht bij afwijzen");
  }

  const set: Record<string, unknown> = {
    reviewedAt: new Date(),
    reviewedBy: input.actor ?? "system",
    reviewDecision: input.decision,
    reviewReason: input.reason ?? null,
    updatedAt: new Date(),
  };
  // afwijzen van een geel → rood (D-04); accepteren laat de kleur staan.
  if (input.decision === "afgewezen") {
    set.status = "rood";
    set.noMatchReason = input.reason ?? null;
  }
  if (input.decision === "variant" && input.variantColor) {
    set.reqColor = input.variantColor;
  }

  await db.update(specLines).set(set).where(eq(specLines.id, input.specLineId));

  await logEvent(db, {
    entity: "spec_line",
    entityId: input.specLineId,
    action: "review_decided",
    actor: input.actor,
    payload: {
      decision: input.decision,
      reason: input.reason ?? null,
      variantColor: input.variantColor ?? null,
    },
  });
}

// Een regel in de review-wachtrij zetten (bv. variantkeuze na een groene match met
// ambigue kleur, of OCR-controle bij import).
export async function flagForReview(
  db: AppDb,
  specLineId: string,
  kind: "geel" | "variant" | "onvolledig" | "ocr",
) {
  await db
    .update(specLines)
    .set({ reviewKind: kind, reviewedAt: null, updatedAt: new Date() })
    .where(eq(specLines.id, specLineId));
}

export async function hasOpenReviews(db: AppDb, dossierId: string): Promise<boolean> {
  const rows = await db
    .select({ id: specLines.id })
    .from(specLines)
    .where(
      and(
        eq(specLines.dossierId, dossierId),
        isNotNull(specLines.reviewKind),
        sql`${specLines.reviewedAt} is null`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}
