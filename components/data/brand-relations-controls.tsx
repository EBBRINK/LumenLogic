// Werkbalk en paginering van het merkrelaties-overzicht. BEWUST GEEN "use client":
// zoeken, filteren en bladeren zijn hier links en één GET-formulier, dus ze werken zonder
// dat er een byte JavaScript voor de tabel geladen hoeft te zijn, en de stand staat in de
// URL — deelbaar, terugknop-bestendig, en de RSC kan er meteen op filteren.
//
// Het idioom komt van components/dossier/status-filter.tsx: knopgeometrie via
// `Button asChild`, de actieve optie draagt `aria-current="page"` plus de teal stip, en
// kleur is niet de enige drager (vulling, gewicht, rand, stip). Niet geïmporteerd maar
// nagevolgd: die component kent alleen projectstatussen.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GEEN_REACTIE_DAGEN } from "@/lib/field-catalog";
import {
  BRAND_RELATIONS_PATH,
  STATUS_LABEL,
  STATUS_ORDER,
  brandRelationsHref,
  type BrandRelationsQuery,
  type PageWindow,
} from "@/lib/brand-relations-view";

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={active ? "default" : "secondary"}
      className={cn(!active && "border-input font-medium")}
    >
      <a href={href} aria-current={active ? "page" : undefined}>
        {active && (
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-brand-teal"
          />
        )}
        {children}
      </a>
    </Button>
  );
}

export function BrandRelationsToolbar({
  query,
  window,
  totalCount,
}: {
  query: BrandRelationsQuery;
  window: PageWindow; // telt de GEFILTERDE rijen
  totalCount: number; // alle merken, ongefilterd
}) {
  const filtered = window.total !== totalCount;
  return (
    <div className="space-y-3">
      {/* GET-formulier: de browser zet zelf ?q=… in de URL. De andere filterstanden gaan
          als verborgen velden mee, anders wist een zoekactie ze stilletjes. `page` gaat
          bewust NIET mee — een nieuwe zoekterm hoort op pagina 1 te beginnen. */}
      <form
        method="get"
        action={BRAND_RELATIONS_PATH}
        className="flex flex-wrap items-center gap-2"
      >
        {query.status !== "alle" && (
          <input type="hidden" name="status" value={query.status} />
        )}
        {query.noResponse && (
          <input type="hidden" name="noresponse" value="1" />
        )}
        <Input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder="Search brand name or code…"
          aria-label="Search brand name or code"
          className="h-9 w-56"
        />
        {/* Submit → `outline`. `secondary` blijft hier voor de filterchips en de pager
            hieronder: schakelaarstanden en inerte navigatie (DESIGN.md §6). */}
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
        {query.q && (
          <Button asChild size="sm" variant="ghost">
            <a href={brandRelationsHref(query, { q: "" })}>Clear search</a>
          </Button>
        )}
      </form>

      <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
        <FilterChip
          href={brandRelationsHref(query, { status: "alle" })}
          active={query.status === "alle"}
        >
          All
        </FilterChip>
        {STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            href={brandRelationsHref(query, { status: s })}
            active={query.status === s}
          >
            {STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <FilterChip
          href={brandRelationsHref(query, { noResponse: !query.noResponse })}
          active={query.noResponse}
        >
          No response (&gt; {GEEN_REACTIE_DAGEN} days)
        </FilterChip>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {window.total === 0
            ? `No brands match — ${totalCount} in total`
            : `Showing ${window.from}–${window.to} of ${window.total}${
                filtered ? ` filtered` : ``
              } brands${filtered ? ` (${totalCount} in total)` : ``}`}
        </span>
      </div>
    </div>
  );
}

export function BrandRelationsPager({
  query,
  window,
}: {
  query: BrandRelationsQuery;
  window: PageWindow;
}) {
  if (window.pageCount <= 1) return null;
  const prev = window.page > 1;
  const next = window.page < window.pageCount;
  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="Pagination"
    >
      {/* Uitgeschakeld = een échte disabled knop, geen dode link: een <a> zonder href is
          niet focusbaar en een <a> naar pagina 0 liegt over waar hij heen gaat. */}
      {prev ? (
        <Button asChild size="sm" variant="secondary">
          <a href={brandRelationsHref(query, { page: window.page - 1 })}>
            Previous
          </a>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="secondary" disabled>
          Previous
        </Button>
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {window.page} of {window.pageCount}
      </span>
      {next ? (
        <Button asChild size="sm" variant="secondary">
          <a href={brandRelationsHref(query, { page: window.page + 1 })}>Next</a>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="secondary" disabled>
          Next
        </Button>
      )}
    </nav>
  );
}
