// Filterbalk boven de merkenlijst — de uitbetaling van G1 (plan §1). Een levensfase
// waarop je niet kunt filteren lost niets op: 437 merken, 18 daarvan met een annotatie in
// de naam. Gewone `<form method="get">`, geen client-state: de URL is de filterstand, dus
// hij is deelbaar, bookmarkbaar en werkt zonder JavaScript.
import { Button } from "@/components/ui/button";
import { veldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { BrandLifecycle } from "@/db/schema";

const PHASE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All lifecycles" },
  { value: "actief", label: "Active" },
  { value: "slapend", label: "Dormant" },
  { value: "bestaat_niet_meer", label: "No longer exists" },
];

export function BrandFilterBar({
  q,
  phase,
  total,
  shown,
}: {
  q?: string;
  phase?: BrandLifecycle | "";
  /** Aantal merken in de database (ongefilterd) — alleen ter oriëntatie. */
  total?: number;
  /** Aantal merken dat nu getoond wordt. */
  shown?: number;
}) {
  const filtering = Boolean(q) || Boolean(phase);
  return (
    <form
      method="get"
      data-testid="brand-filter-bar"
      className="mb-4 flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1 text-sm">
        Search
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Name or brand code"
          aria-label="Search by name or brand code"
          className={cn(veldClass, "w-56")}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Lifecycle
        <select
          name="phase"
          defaultValue={phase ?? ""}
          aria-label="Filter by lifecycle"
          className={veldClass}
        >
          {PHASE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {/* Outline: de primary van /admin/brands is "New brand". Via het Button-component,
          zodat de knop dezelfde 44px haalt als de velden ernaast (O9), niet 36px. */}
      <Button type="submit" variant="outline">
        Filter
      </Button>
      {filtering && (
        <a
          href="/admin/brands"
          className="inline-flex h-9 items-center text-sm text-muted-foreground underline underline-offset-4"
        >
          Clear
        </a>
      )}
      {shown !== undefined && (
        <span className="ml-auto self-center text-sm text-muted-foreground tabular-nums">
          {total !== undefined && total !== shown
            ? `${shown} of ${total} brands`
            : `${shown} brands`}
        </span>
      )}
    </form>
  );
}
