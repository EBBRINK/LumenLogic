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
  verlopen: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "7": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "14": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "30": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
