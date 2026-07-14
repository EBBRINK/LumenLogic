"use client";

// Merkrelaties-overzicht (plan-merkrelaties stap 3): de ~430 merken met relatiestatus
// (inline muteerbaar), prijslijst-indicator, productaantal en K8-dubbele-code-badge.
// "Geen reactie" is géén status maar een filter (K1): status 'benaderd' waarvan het
// laatste contact langer dan GEEN_REACTIE_DAGEN geleden is.
import { useMemo, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { GEEN_REACTIE_DAGEN } from "@/lib/field-catalog";
import { MiniScorecard, type BucketBlok } from "./mini-scorecard";

export type RelationStatus =
  | "niet_benaderd"
  | "benaderd"
  | "wacht_op_data"
  | "data_ontvangen"
  | "verwerkt"
  | "afgewezen";

export type PriceIndicator =
  | "aanwezig_geldig"
  | "verloopt_binnenkort"
  | "verlopen"
  | "ontbreekt";

export type BrandRelationTableRow = {
  brandId: string;
  brandName: string;
  brandCode: string | null;
  status: RelationStatus;
  lastContactAt: string | null;
  productCount: number;
  priceListIndicator: PriceIndicator;
  sharedBrandCode: boolean;
  // Stap 4: mini-scorecard (10 blokjes); null = compleetheid onbekend/0 producten.
  scorecard: BucketBlok[] | null;
};

export const STATUS_LABEL: Record<RelationStatus, string> = {
  niet_benaderd: "Niet benaderd",
  benaderd: "Benaderd",
  wacht_op_data: "Wacht op data",
  data_ontvangen: "Data ontvangen",
  verwerkt: "Verwerkt",
  afgewezen: "Afgewezen",
};

const INDICATOR_LABEL: Record<PriceIndicator, string> = {
  aanwezig_geldig: "Geldig",
  verloopt_binnenkort: "Verloopt binnenkort",
  verlopen: "Verlopen",
  ontbreekt: "Ontbreekt",
};

const INDICATOR_TINT: Record<PriceIndicator, string> = {
  aanwezig_geldig:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  verloopt_binnenkort:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  verlopen: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ontbreekt: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

function daysSince(iso: string, todayIso: string): number {
  return Math.floor(
    (Date.parse(todayIso) - Date.parse(iso)) / (24 * 60 * 60 * 1000),
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function BrandRelationsTable({
  rows,
  todayIso,
  updateAction,
}: {
  rows: BrandRelationTableRow[];
  todayIso: string; // vaste "vandaag" uit de RSC — deterministisch testbaar
  updateAction: (formData: FormData) => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | RelationStatus>(
    "alle",
  );
  const [geenReactie, setGeenReactie] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.brandName.toLowerCase().includes(q)) return false;
      if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (geenReactie) {
        if (r.status !== "benaderd") return false;
        if (!r.lastContactAt) return false;
        if (daysSince(r.lastContactAt, todayIso) <= GEEN_REACTIE_DAGEN)
          return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, geenReactie, todayIso]);

  function setStatus(brandId: string, status: string) {
    const fd = new FormData();
    fd.set("brandId", brandId);
    fd.set("status", status);
    startTransition(() => void updateAction(fd));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op merknaam…"
          aria-label="Zoek op merknaam"
          className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "alle" | RelationStatus)
          }
          aria-label="Filter op status"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="alle">Alle statussen</option>
          {(Object.keys(STATUS_LABEL) as RelationStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={geenReactie}
            onChange={(e) => setGeenReactie(e.target.checked)}
          />
          Geen reactie (&gt; {GEEN_REACTIE_DAGEN} dagen)
        </label>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {filtered.length} van {rows.length} merken
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Geen merken die aan de filters voldoen.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Laatste contact</TableHead>
              <TableHead>Prijslijst</TableHead>
              <TableHead className="text-right">Producten</TableHead>
              <TableHead>Compleetheid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.brandId}>
                <TableCell className="font-medium">
                  <a
                    href={`/data/merkrelaties/${r.brandId}`}
                    className="hover:underline"
                  >
                    {r.brandName}
                  </a>
                  {r.brandCode && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.brandCode}
                    </span>
                  )}
                  {r.sharedBrandCode && (
                    <span
                      className="ml-2 inline-flex h-5 items-center rounded-full bg-orange-100 px-2 text-xs font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                      title="Meerdere merken delen deze code — niet dubbel benaderen"
                    >
                      dubbele code
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <select
                    value={r.status}
                    disabled={pending}
                    onChange={(e) => setStatus(r.brandId, e.target.value)}
                    aria-label={`Status van ${r.brandName}`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {(Object.keys(STATUS_LABEL) as RelationStatus[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ),
                    )}
                  </select>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {fmtDate(r.lastContactAt)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                      INDICATOR_TINT[r.priceListIndicator],
                    )}
                  >
                    {INDICATOR_LABEL[r.priceListIndicator]}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.productCount}
                </TableCell>
                <TableCell>
                  <MiniScorecard blokken={r.scorecard} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
