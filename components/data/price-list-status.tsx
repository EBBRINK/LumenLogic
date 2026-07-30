// Prijslijst-dekking: verloopt-binnenkort (30/14/7 dagen) + verlopen = dekkingsgat.
// Ijzeren regel 3: een verlopen prijslijst maakt de producten onzichtbaar in de matcher —
// dus verlopen is geen alarm maar een zichtbaar gat dat om een nieuwe lijst vraagt.
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PriceListExpiryNotice } from "@/components/data/price-list-expiry-notice";
import { cn } from "@/lib/utils";

export type PriceListRow = {
  id: string;
  name: string;
  brandName: string | null;
  validUntil: string;
  productCount: number;
  daysLeft: number;
  bucket: "verlopen" | "7" | "14" | "30" | "ok";
};

const BUCKET_TINT: Record<PriceListRow["bucket"], string> = {
  verlopen: "bg-status-grey-tint text-status-grey-ink",
  "7": "bg-status-amber-tint text-status-amber-ink",
  "14": "bg-status-amber-tint text-status-amber-ink",
  "30": "bg-status-blue-tint text-status-blue-ink",
  ok: "bg-status-green-tint text-status-green-ink",
};

function bucketLabel(r: PriceListRow): string {
  if (r.bucket === "verlopen") return `Expired (${Math.abs(r.daysLeft)} d ago)`;
  if (r.bucket === "ok") return `${r.daysLeft} d valid`;
  return `Expires in ${r.daysLeft} d`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function PriceListStatusTable({ rows }: { rows: PriceListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No price lists in the catalog yet.
      </p>
    );
  }
  const gaps = rows.filter((r) => r.bucket === "verlopen").length;
  const soon = rows.filter(
    (r) => r.bucket === "7" || r.bucket === "14" || r.bucket === "30",
  ).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {gaps > 0 && (
          <span className="text-foreground">
            {gaps} expired (coverage gap)
          </span>
        )}
        {gaps > 0 && soon > 0 && " · "}
        {soon > 0 && <span>{soon} expiring soon</span>}
        {gaps === 0 && soon === 0 && "All price lists valid with room to spare."}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Price list</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead>Valid until</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {r.brandName ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.productCount}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {fmtDate(r.validUntil)}
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                    BUCKET_TINT[r.bucket],
                  )}
                >
                  {bucketLabel(r)}
                </span>
                {/* Sprint 1.6 (deel B): lichtste variant — dit scherm gaat over lijsten,
                    niet over merken. Zelfde gedeelde component als de merkschermen, dus
                    deze regel kan nooit uit de pas gaan lopen met de banner/badge. */}
                {r.bucket === "verlopen" && (
                  // whitespace-normal overschrijft TableCell's whitespace-nowrap
                  // (components/ui/table.tsx) — anders overlapt de tekst de andere
                  // kolommen in plaats van netjes af te breken.
                  <div className="mt-1 max-w-xs whitespace-normal text-left">
                    <PriceListExpiryNotice
                      indicator="verlopen"
                      validUntil={r.validUntil}
                      variant="inline"
                      brandName={r.brandName ?? undefined}
                    />
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
