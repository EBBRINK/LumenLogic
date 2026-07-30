// Pure vertaling van een BucketScore naar een mini-scorecard-blokje. Apart van
// mini-scorecard.tsx (client) zodat RSC-pagina's hem server-side kunnen aanroepen.
// ⚠️ Zonder aanroeper sinds 30 jul, samen met MiniScorecard — zie de kop van
// mini-scorecard.tsx voor waarom die niet weggegooid zijn.
import type { BucketScore, CatalogBucket } from "@/lib/field-catalog";
import type { BucketBlok } from "./mini-scorecard";

// Blokje kleurt op de must-ratio; buckets zonder must-velden vallen terug op
// wanna en daarna nice. Grijs (null) = geen meetbare velden of geen producten.
export function bucketBlok(
  bucket: Pick<CatalogBucket, "key" | "labelEn">,
  score: BucketScore,
  hasProducts: boolean,
): BucketBlok {
  const ratio =
    !hasProducts || score.measurableTotal === 0
      ? null
      : score.must.total > 0
        ? score.must.ratio
        : score.wanna.total > 0
          ? score.wanna.ratio
          : score.nice.ratio;
  return {
    key: bucket.key,
    labelEn: bucket.labelEn,
    ratio,
    mustComplete: score.must.total === 0 || score.must.ratio >= 1,
  };
}
