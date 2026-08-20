// Het prijslijst-overzicht, gesorteerd op urgentie in plaats van op vervaldatum.
//
// Waarom dit een tweede tabel is naast PriceListStatusTable: die tabel toont één rij per
// PRIJSLIJST, en een merk zonder prijslijst heeft daar geen rij. Juist dat merk is het
// grootste dekkingsgat dat er is (ijzeren regel 3: nul zichtbare producten), dus het
// overzicht dat naar urgentie sorteert gaat per MERK. De statusbadge komt wél uit die eerste
// tabel (`priceListBadge`) — één presentatie, geen tweede kopie die uit de pas kan lopen.
//
// Server-component, geen client-JS, geen lucide-react: de sorteerstand leeft in de URL en de
// kolomkoppen zijn links. Zelfde reden als bij price-list-expiry-notice.tsx (de RSC-testbrug
// struikelt over client-referenties) én zelfde idioom als de werkbalk van /data/brand-relations.
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrandLifecycleBadge } from "@/components/admin/brand-lifecycle-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { priceListBadge } from "@/components/data/price-list-status";
import { expiryBucket } from "@/lib/repo/enrichment";
import {
  geenBruikbareLijst,
  PRICE_LISTS_PATH,
  sortUrgencyRows,
  urgencyHref,
  urgencyReason,
  type BrandUrgencyRow,
  type UrgencyQuery,
  type UrgencySort,
} from "@/lib/price-list-urgency";
import { cn } from "@/lib/utils";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** De dagen-kolom in woorden. "—" alleen als er geen lijst is; 0 is een echte waarde. */
function dagenLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "—";
  if (daysLeft < 0) return `${daysLeft}`;
  return `+${daysLeft}`;
}

const KOLOM_LABEL: Record<UrgencySort, string> = {
  urgency: "Urgency",
  days: "Days",
  projects: "Projects",
  lines: "Spec lines",
  brand: "Brand",
};

function SortHeader({
  sort,
  query,
  basePath,
  className,
}: {
  sort: UrgencySort;
  query: UrgencyQuery;
  basePath: string;
  className?: string;
}) {
  const actief = query.sort === sort;
  return (
    <TableHead
      className={className}
      aria-sort={actief ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {/* Een kale <a> en geen next/link: dit is een server-component die white-box gerenderd
          wordt, en next/link is een client-referentie waar de RSC-testbrug op stukloopt.
          Precedent: components/data/data-cards.tsx, om exact dezelfde reden. De sortering is
          server-werk, dus een volledige navigatie kost hier niets. */}
      <a
        href={urgencyHref(query, sort, basePath)}
        // aria-sort staat op de cel hierboven, niet op de link; de pijl is puur decoratief.
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          actief ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {KOLOM_LABEL[sort]}
        {actief && (
          <span aria-hidden="true">{query.dir === "asc" ? "↑" : "↓"}</span>
        )}
      </a>
    </TableHead>
  );
}

export function PriceListUrgencyTable({
  rows,
  query,
  basePath = PRICE_LISTS_PATH,
}: {
  rows: BrandUrgencyRow[];
  query: UrgencyQuery;
  /** Het scherm bepaalt zijn eigen pad — dit overzicht verhuist naar Brand Management. */
  basePath?: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No brands in the catalog yet."
        description="Once brands are loaded, this list orders them by what needs picking up first."
        action={null}
      />
    );
  }
  const gesorteerd = sortUrgencyRows(rows, query);
  // Dekkingsgat = de matcher haalt nul producten uit dit merk: verlopen, leeg, of geen lijst.
  // Zelfde begrip als `isCoverageGap` op de prijslijst-tabel, één merkniveau hoger.
  const gaten = rows.filter(
    (r) => geenBruikbareLijst(r) || (r.daysLeft !== null && r.daysLeft < 0),
  ).length;
  const zonderLijst = rows.filter((r) => r.priceListId === null).length;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {gaten > 0 ? (
          // Zelfde amber-inkt als de bestaande dekkingsgat-tellingen (besluit O13: er komt
          // geen token bij). Het aantal merken zonder énige lijst staat er apart bij: dat
          // gat is met geen enkele verlenging te dichten, alleen met een nieuwe lijst.
          <span className="font-medium text-status-amber-ink">
            {gaten} coverage gap{gaten > 1 ? "s" : ""}
            {zonderLijst > 0 && ` · ${zonderLijst} without any price list`}
          </span>
        ) : (
          <span className="text-muted-foreground">
            Every brand has a price list with products in it.
          </span>
        )}
        <span className="text-muted-foreground">
          {" "}
          · Sorted by {KOLOM_LABEL[query.sort].toLowerCase()}. Urgency ={" "}
          demand × time to expiry — never price or margin.
        </span>
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader sort="brand" query={query} basePath={basePath} />
            <TableHead>Price list</TableHead>
            <TableHead>Valid until</TableHead>
            <SortHeader sort="days" query={query} basePath={basePath} className="text-right" />
            <SortHeader sort="projects" query={query} basePath={basePath} className="text-right" />
            <SortHeader sort="lines" query={query} basePath={basePath} className="text-right" />
            <SortHeader sort="urgency" query={query} basePath={basePath} className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {gesorteerd.map((r) => {
            // Een merk zónder lijst krijgt geen datum-badge maar zijn eigen: er valt niets te
            // verlengen, er moet een lijst kómen.
            const badge =
              r.daysLeft === null
                ? { label: "No price list", tint: "bg-status-amber-tint text-status-amber-ink" }
                : priceListBadge({
                    id: r.priceListId ?? r.brandId,
                    name: r.priceListName ?? "",
                    brandName: r.brandName,
                    validUntil: r.validUntil ?? "",
                    productCount: r.priceCount,
                    daysLeft: r.daysLeft,
                    bucket: expiryBucket(r.daysLeft),
                    lifecycle: r.lifecycle,
                  });
            return (
              <TableRow key={r.brandId}>
                <TableCell className="font-medium">
                  {r.brandName}
                  {/* Dezelfde badge als /admin/brands en de prijslijst-tabel: een merk dat
                      niet meer bestaat mag hier geen schone rij zijn. */}
                  <BrandLifecycleBadge lifecycle={r.lifecycle} className="ml-2" />
                  {/* De reden staat ONDER de merknaam en niet in een eigen kolom: hij is de
                      verklaring van de sortering, dus hij hoort bij de rij als geheel. In een
                      eigen kolom brak hij over drie regels — dezelfde fout die de UX-audit
                      van 30 jul in de Status-cel van de prijslijst-tabel vond. */}
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {urgencyReason(r)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.priceListName ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {r.validUntil ? fmtDate(r.validUntil) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {dagenLabel(r.daysLeft)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.demand.projects12m}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.demand.lines12m}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                      badge.tint,
                    )}
                  >
                    {badge.label}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
