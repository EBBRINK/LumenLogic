import { db } from "@/db/client";
import { ReviewQueue } from "@/components/dossier/review-queue";
import type {
  Deviation,
  MatchStatus,
  RedLinkLine,
  ReviewCandidate,
  ReviewItem,
} from "@/components/dossier/types";
import { formatDate } from "@/lib/format";
import { getOpenSuggestionsByLine } from "@/lib/repo/ai-suggestions";
import { getDossier } from "@/lib/repo/dossiers";
import { getCandidates } from "@/lib/repo/matching";
import { getVisibleProduct, searchProducts } from "@/lib/repo/products";
import { getRedLinkLines, getReviewQueue } from "@/lib/repo/review";
import { getColorVariants } from "@/lib/repo/variants";
import { getActor, requireSession } from "@/lib/session";
import { requireUuid } from "@/lib/uuid";
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
// Eén datumformaat voor de hele app (UX-audit 30 jul, bug #9): hier stond een eigen
// nl-NL-formatter, `09-07-2026`. `null` blijft `null` — die betekent hier "nog niet
// beoordeeld" en dat is iets anders dan een onleesbare datum.
function fmtDate(value: Date | string | null): string | null {
  return value ? formatDate(value) : null;
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
    // OCR-herkomst voor de "View page image"-link op de OcrCard (bouwstap 7/8).
    sourcePage: r.sourcePage,
    importRunId: r.importRunId,
    // Geen paginabeeld voor déze pagina (leesroute-run, of een OCR-run met maar
    // een deel van zijn pagina's in beeld) → de kaart linkt naar het
    // markdown-controlespoor in plaats van naar een 404 (UX-audit 30 jul).
    hasPageImage: r.hasPageImage,
    // Ruwe brontekst van de regel — waartegen de reviewer de lezing vergelijkt.
    sourceText: r.sourceText,
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
    name: products[i]?.name ?? "(product no longer visible)",
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
  searchParams: Promise<{ line?: string; q?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  // Layout en pagina renderen concurrent en dekken elkaar dus NIET; zonder deze
  // regel gooit getReviewQueue de uuid-cast en wint die 500 van de nette 404 van
  // de layout. Zie de regel bij requireUuid in lib/uuid.ts.
  requireUuid(id);
  const { line, q } = await searchParams;
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
  const query = (q ?? "").trim();
  const rood: RedLinkLine[] = await Promise.all(
    redRows.map(async (r) => {
      if (!line || r.id !== line || !query)
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
