// Volledige compleetheids-scorecard (sprint 1.6, besluiten G9-G12): categorie 1 t/m 10
// gaan uitsluitend over wat het merk-Excel daadwerkelijk vraagt (G9), elk met een eigen
// percentage; categorie "11. Internal" staat er apart onder, zichtbaar maar nooit
// meegewogen (G10); onderaan drie totalen (Required/Requested/Optional — de opgeslagen
// enum blijft must/wanna/nice, zie lib/niveau-labels.ts), veldgewogen over 1 t/m 10 (G11),
// niet over categorieën gemiddeld (G12 — anders weegt Commercie's ene veld even zwaar als
// Fotometrie's elf).
//
// Deze component rekent zelf NIETS meer uit: alle percentages komen kant-en-klaar uit
// `aggregate` (scorecardAggregate() in lib/repo/brand-relations.ts). Dat voorkomt dat
// weergave en meting uit elkaar lopen — precies hoe field-catalog.measure ooit vijf weken
// achterliep op het schema.
//
// Presentational — RSC-vriendelijk, geen client-JS, geen lucide-react (zie het commentaar
// bij PriceListExpiryNotice: de RSC-testbrug struikelt over de client-referentie van lucide).
import type {
  CategorieScore,
  FieldCoverage,
  ScorecardAggregate,
} from "@/lib/field-catalog";
import { niveauLabel } from "@/lib/niveau-labels";
import { cn } from "@/lib/utils";

// Zelfde gradient als voorheen: donkergroen bij 100% must, verloop eronder.
function dekkingKleur(ratio: number, mustComplete: boolean): string {
  if (mustComplete && ratio >= 1) return "hsl(142 72% 26%)";
  return `hsl(${Math.round(ratio * 110)} 65% 45%)`;
}

function FieldRow({
  field,
  mustComplete,
}: {
  field: FieldCoverage;
  mustComplete: boolean;
}) {
  const ratio = field.ratio;
  return (
    <li
      className="flex items-center gap-2 text-sm"
      title={
        ratio === null
          ? `${field.labelEn}: not measurable yet — only counts once the column exists in the data model`
          : `${field.labelEn}: ${Math.round(ratio * 100)}% of products filled`
      }
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          ratio === null && "text-muted-foreground",
        )}
      >
        {field.labelEn}
        {field.internalOnly && (
          // lucide-react kan niet in RSC-getestte server-componenten (client context) —
          // dus een kale badge (precedent: stond al zo vóór 1.6).
          <span
            aria-label="internal"
            title="Internal-commercial — never in the brand Excel"
            className="ml-1.5 inline-flex h-4 items-center rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
          >
            internal
          </span>
        )}
      </span>
      {/* UX-audit 30 jul (item 4): hier stond het ruwe enum-woord, in kapitalen — 66×
          "WANNA" op een scherm dat merken te zien krijgen. De opgeslagen waarde is
          ongewijzigd; alleen het label komt nu uit lib/niveau-labels.ts. */}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {niveauLabel(field.niveau)}
      </span>
      {ratio === null ? (
        <span className="w-24 text-right text-xs text-muted-foreground">
          not measurable
        </span>
      ) : (
        <span className="flex w-24 items-center justify-end gap-1.5">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.round(ratio * 100)}%`,
                backgroundColor: dekkingKleur(ratio, mustComplete),
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
}

// mustComplete op categorie-niveau: dezelfde definitie als de oude BucketScore-tak
// (geen must-velden, of must-ratio 100%) — nu gelezen uit perNiveau.must.
function categoryMustComplete(category: CategorieScore): boolean {
  return (
    category.perNiveau.must.measurableFields === 0 ||
    category.perNiveau.must.ratio >= 1
  );
}

function CategorySection({ category }: { category: CategorieScore }) {
  const mustComplete = categoryMustComplete(category);
  return (
    <section className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {category.order}. {category.labelEn}
        </h3>
        {category.measurableFields === 0 ? (
          <span className="text-xs text-muted-foreground">
            not measurable yet
          </span>
        ) : (
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {Math.round(category.ratio * 100)}%
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {category.fields.map((f) => (
          <FieldRow key={f.key} field={f} mustComplete={mustComplete} />
        ))}
      </ul>
    </section>
  );
}

export function BrandScorecard({
  aggregate,
}: {
  aggregate: ScorecardAggregate;
}) {
  if (!aggregate.hasProducts) {
    return (
      <p className="text-sm text-muted-foreground">
        No products in the catalog — completeness n/a until this brand is loaded.
      </p>
    );
  }

  // Categorie 1-10 (G9) versus categorie 11 "Internal" (G10) — de aggregatie draagt dat
  // onderscheid al als `inTotals`, dus geen `order <= 10`-drempel hier.
  const templateCategories = aggregate.categories.filter((c) => c.inTotals);
  const internalCategory = aggregate.categories.find((c) => !c.inTotals);
  const internalMustComplete = internalCategory
    ? categoryMustComplete(internalCategory)
    : false;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Coverage per field across {aggregate.productCount} product(s), weighted
        per field — not per category (one price field counts as much as one
        photometric field). Categories 1–10 cover exactly the{" "}
        {aggregate.templateFieldCount} fields requested in the brand Excel
        (scored: {aggregate.scoredFieldCount}). Dark green = all{" "}
        {niveauLabel("must")} fields
        100% filled; below that the bar tracks the coverage. Gray = not
        measurable yet. Fields with a lock are internal-commercial and are
        shown separately below — never counted in the totals.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {templateCategories.map((category) => (
          <CategorySection key={category.bucketKey} category={category} />
        ))}
      </div>

      {internalCategory && (
        <section className="rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {internalCategory.order}. {internalCategory.labelEn}
            </h3>
            <span className="text-xs text-muted-foreground">
              not included in the totals
            </span>
          </div>
          <ul className="space-y-1.5">
            {internalCategory.fields.map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                mustComplete={internalMustComplete}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
        <h3 className="mb-3 text-sm font-medium">Totals — categories 1–10</h3>
        <div className="grid grid-cols-3 gap-4">
          {(["must", "wanna", "nice"] as const).map((niveau) => (
            <div
              key={niveau}
              aria-label={`Total ${niveauLabel(niveau)}`}
              className="text-center"
            >
              <div className="text-2xl font-semibold tabular-nums">
                {Math.round(aggregate.totals[niveau].ratio * 100)}%
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {niveauLabel(niveau)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
