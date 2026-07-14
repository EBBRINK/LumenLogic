// Volledige compleetheids-scorecard (stap 5): per bucket alle velden met dekkings-%
// op een gradient (Timo-besluit 1: donkergroen = alle must-velden 100%, geen harde
// drempel). Niet-meetbare velden grijs "nog niet meetbaar"; 🔒-velden gemarkeerd als
// intern (nooit in het merk-Excel). Presentational — RSC-vriendelijk, geen client-JS.
import type {
  BucketScore,
  CatalogBucket,
  Compleetheidsniveau,
} from "@/lib/field-catalog";
import { cn } from "@/lib/utils";

export type ScorecardBucket = {
  bucket: CatalogBucket;
  score: BucketScore;
};

const NIVEAU_LABEL: Record<Compleetheidsniveau, string> = {
  must: "must",
  wanna: "wanna",
  nice: "nice",
};

// Zelfde gradient als de mini-scorecard: donkergroen bij 100%, verloop eronder.
function dekkingKleur(ratio: number, mustComplete: boolean): string {
  if (mustComplete && ratio >= 1) return "hsl(142 72% 26%)";
  return `hsl(${Math.round(ratio * 110)} 65% 45%)`;
}

export function BrandScorecard({
  buckets,
  filledByField,
  productCount,
  hasProducts,
}: {
  buckets: ScorecardBucket[];
  filledByField: Record<string, number>;
  productCount: number;
  hasProducts: boolean;
}) {
  if (!hasProducts) {
    return (
      <p className="text-sm text-muted-foreground">
        Geen producten in de catalogus — compleetheid n.v.t. tot dit merk is
        ingeladen.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Dekking per veld over {productCount} product(en). Donkergroen = alle
        must-velden 100% gevuld; daaronder kleurt de balk mee met de
        dekkingsgraad. Grijs = nog niet meetbaar (veld bestaat nog niet in het
        datamodel). Velden met een slotje zijn intern-commercieel en gaan nooit
        naar het merk.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {buckets.map(({ bucket, score }) => {
          const mustComplete = score.must.total === 0 || score.must.ratio >= 1;
          return (
            <section
              key={bucket.key}
              className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {bucket.order}. {bucket.labelNl}
                </h3>
                {score.measurableTotal === 0 && (
                  <span className="text-xs text-muted-foreground">
                    nog niet meetbaar
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {bucket.fields.map((f) => {
                  const measurable = f.measure.kind !== "none";
                  const ratio = measurable
                    ? Math.min(
                        (filledByField[f.key] ?? 0) / productCount,
                        1,
                      )
                    : null;
                  return (
                    <li
                      key={f.key}
                      className="flex items-center gap-2 text-sm"
                      title={
                        ratio === null
                          ? `${f.labelNl}: nog niet meetbaar — telt pas mee zodra de kolom in het datamodel bestaat`
                          : `${f.labelNl}: ${Math.round(ratio * 100)}% van de producten gevuld`
                      }
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          ratio === null && "text-muted-foreground",
                        )}
                      >
                        {f.labelNl}
                        {f.internalOnly && (
                          // lucide-react kan niet in RSC-getestte server-
                          // componenten (client context) — dus een kale badge.
                          <span
                            aria-label="intern"
                            title="Intern-commercieel — nooit in het merk-Excel"
                            className="ml-1.5 inline-flex h-4 items-center rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                          >
                            intern
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {NIVEAU_LABEL[f.niveau]}
                      </span>
                      {ratio === null ? (
                        <span className="w-24 text-right text-xs text-muted-foreground">
                          niet meetbaar
                        </span>
                      ) : (
                        <span className="flex w-24 items-center justify-end gap-1.5">
                          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.round(ratio * 100)}%`,
                                backgroundColor: dekkingKleur(
                                  ratio,
                                  mustComplete,
                                ),
                              }}
                            />
                          </span>
                          <span className="w-8 text-right text-xs tabular-nums">
                            {Math.round(ratio * 100)}%
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
