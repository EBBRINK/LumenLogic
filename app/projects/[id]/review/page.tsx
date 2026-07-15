import { db } from "@/db/client";
import { ReviewQueue } from "@/components/dossier/review-queue";
import type {
  Deviation,
  MatchStatus,
  RedLinkLine,
  ReviewCandidate,
  ReviewItem,
} from "@/components/dossier/types";
import { getOpenSuggestionsByLine } from "@/lib/repo/ai-suggestions";
import { getDossier } from "@/lib/repo/dossiers";
import { getCandidates } from "@/lib/repo/matching";
import { getVisibleProduct, searchProducts } from "@/lib/repo/products";
import { getRedLinkLines, getReviewQueue } from "@/lib/repo/review";
import { getColorVariants } from "@/lib/repo/variants";
import { getActor, requireSession } from "@/lib/session";
import {
  decideReviewAction,
  dismissAiSuggestionAction,
  linkManualProductAction,
  useAiSuggestionAction,
} from "../../actions";

// Tab REVIEW — header en tabs komen uit layout.tsx, dus deze pagina rendert alleen zijn
// eigen inhoud (fragment). De wachtrij is elke regel met reviewKind ≠ null; afgeronde
// regels dragen hun audit-spoor. Volgorde = aanvraagvolgorde (getReviewQueue sorteert al).
// Daaronder de rode regels zonder match ("Niet gevonden — handmatig linken", stap 7):
// rood is een status, geen review-flag — eigen query, eigen sectie. De catalogus-zoeker
// op zo'n kaart werkt via de query-string (?regel&zoek, zelfde patroon als /catalog):
// de mens zoekt, de server leest visible_products — nooit ongevraagde suggesties
// (ijzeren regel 4).
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

// Persistente kandidaten van een regel, verrijkt met nog-zichtbare productdata
// (zelfde patroon als het regel-detail: een niet meer zichtbaar product verdwijnt
// niet stilzwijgend, maar toont zich zonder data).
async function candidatesFor(specLineId: string): Promise<ReviewCandidate[]> {
  const raw = await getCandidates(db, specLineId);
  const products = await Promise.all(
    raw.map((c) => getVisibleProduct(db, c.productId)),
  );
  return raw.map((c, i) => ({
    productId: c.productId,
    name: products[i]?.name ?? "(product niet meer zichtbaar)",
    brandName: products[i]?.brandName ?? null,
    articleCode: products[i]?.articleCode ?? null,
    list: c.list === "onvolledig" ? ("onvolledig" as const) : ("aantoonbaar" as const),
    deviations: (c.verdicts ?? null) as Deviation[] | null,
  }));
}

export default async function ReviewTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ regel?: string; zoek?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { regel, zoek } = await searchParams;
  const { pending, done } = await getReviewQueue(db, id);
  // Fase voor de AI-suggestie-render-guard (regel 4) + de suggesties zelf (B4).
  const dossier = await getDossier(db, id);
  const phase = dossier?.phase === "awarded" ? ("awarded" as const) : ("tender" as const);
  const suggestionsByLine = await getOpenSuggestionsByLine(db, id);

  // Verrijking per wachtend item: kandidaten (voor "welke van deze N" en de
  // variant-fallback) en échte kleurvarianten (alleen bij variant-reviews).
  const pendingItems: ReviewItem[] = await Promise.all(
    pending.map(async (r) => {
      const base = toReviewItem(r);
      if (r.reviewKind === "geel" || r.reviewKind === "variant") {
        base.candidates = await candidatesFor(r.id);
      }
      if (r.reviewKind === "variant") {
        base.variants = await getColorVariants(db, r.id);
      }
      base.aiSuggestions = suggestionsByLine.get(r.id) ?? [];
      return base;
    }),
  );

  // Rood zonder match → handmatig linken. Zoekresultaten alleen voor de regel
  // waarvoor de mens zocht (query-string), via searchProducts (logt zelf het event).
  const redRows = await getRedLinkLines(db, id);
  const query = (zoek ?? "").trim();
  const rood: RedLinkLine[] = await Promise.all(
    redRows.map(async (r) => {
      if (!regel || r.id !== regel || !query)
        return { ...r, aiSuggestions: suggestionsByLine.get(r.id) ?? [] };
      const results = await searchProducts(db, {
        query,
        limit: 6,
        actor: await getActor(),
        specLineId: r.id,
      });
      return {
        ...r,
        searchQuery: query,
        results: results.map((p) => ({
          id: p.id,
          name: p.name,
          brandName: p.brandName,
          articleCode: p.articleCode,
          grossPrice: p.grossPrice,
        })),
        aiSuggestions: suggestionsByLine.get(r.id) ?? [],
      };
    }),
  );

  return (
    <ReviewQueue
      dossierId={id}
      pending={pendingItems}
      done={done.map(toReviewItem)}
      rood={rood}
      phase={phase}
      decideAction={decideReviewAction}
      linkAction={linkManualProductAction}
      aiUseAction={useAiSuggestionAction}
      aiDismissAction={dismissAiSuggestionAction}
    />
  );
}
