import { db } from "@/db/client";
import { ReviewQueue } from "@/components/dossier/review-queue";
import type { Deviation, MatchStatus, ReviewItem } from "@/components/dossier/types";
import { getReviewQueue } from "@/lib/repo/review";
import { requireSession } from "@/lib/session";
import { decideReviewAction } from "../../actions";

// Tab REVIEW — header en tabs komen uit layout.tsx, dus deze pagina rendert alleen zijn
// eigen inhoud (fragment). De wachtrij is elke regel met reviewKind ≠ null; afgeronde
// regels dragen hun audit-spoor. Volgorde = aanvraagvolgorde (getReviewQueue sorteert al).
const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function fmtDate(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

type QueueRow = Awaited<ReturnType<typeof getReviewQueue>>["pending"][number];

function toReviewItem(r: QueueRow): ReviewItem {
  return {
    id: r.id,
    fixtureCode: r.fixtureCode,
    brandText: r.brandText,
    productText: r.productText,
    status: r.status as MatchStatus,
    reviewKind: (r.reviewKind ?? "geel") as ReviewItem["reviewKind"],
    deviations: (r.deviations ?? null) as Deviation[] | null,
    reqColor: r.reqColor,
    reviewedAt: fmtDate(r.reviewedAt),
    reviewedBy: r.reviewedBy,
    reviewDecision: r.reviewDecision,
  };
}

export default async function ReviewTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { pending, done } = await getReviewQueue(db, id);

  return (
    <ReviewQueue
      dossierId={id}
      pending={pending.map(toReviewItem)}
      done={done.map(toReviewItem)}
      decideAction={decideReviewAction}
    />
  );
}
