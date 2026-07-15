// Verrijkingsschermen (H-03…H-06): merk kiezen om een run te starten, de lopende/afgeronde
// runs, en het steekproef-controlescherm (item per item goed/fout + publiceren/verwerpen).
// Alles presentational + fixture-testbaar: data en form-actions komen als props binnen.
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconCheck } from "@/components/dossier/icons";
import { RunStatusBadge, type RunStatus } from "./enrichment-status";

type FormAction = (formData: FormData) => void | Promise<void>;

export type EnrichBrand = {
  id: string;
  name: string;
  productCount: number;
  enriched: number;
};

// Merk kiezen → parser-run starten. Merken zonder producten kunnen niet (niets te parsen).
export function BrandPicker({
  brands,
  startAction,
}: {
  brands: EnrichBrand[];
  startAction: FormAction;
}) {
  if (brands.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen merken in de catalogus om te verrijken.
      </p>
    );
  }
  return (
    <form action={startAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Merk</span>
        <select
          name="brandId"
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          defaultValue={brands[0]?.id}
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id} disabled={b.productCount === 0}>
              {b.name} — {b.productCount} prod.
              {b.enriched > 0 ? ` (${b.enriched} verrijkt)` : ""}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm">
        Parser draaien
      </Button>
    </form>
  );
}

export type EnrichRunRow = {
  id: string;
  brandName: string;
  status: RunStatus;
  counts: Record<string, number> | null;
  sampleErrorRate: string | null;
  createdAt: string | Date;
};

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function EnrichmentRunsTable({ runs }: { runs: EnrichRunRow[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen verrijkingsruns. Kies hierboven een merk en draai de parser.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Merk</TableHead>
          <TableHead>Datum</TableHead>
          <TableHead className="text-right">Geparsed</TableHead>
          <TableHead className="text-right">Steekproef</TableHead>
          <TableHead className="text-right">Foutratio</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => {
          const c = r.counts ?? {};
          const err =
            r.sampleErrorRate != null
              ? `${Math.round(Number(r.sampleErrorRate) * 100)}%`
              : "—";
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.brandName}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {fmtDate(r.createdAt)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.geparsed ?? 0}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.steekproef ?? 0}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {err}
              </TableCell>
              <TableCell>
                <RunStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="outline">
                  <a href={`/data/enrichment/${r.id}`}>Bekijk</a>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export type SampleItem = {
  id: string;
  productName: string;
  field: string;
  value: string;
  sampleVerdict: "goed" | "fout" | null;
};

// Het steekproef-controlescherm (H-05): per item beslist een mens goed/fout. Publiceren past
// alles toe behalve de 'fout'-items; verwerpen laat de catalogus onaangeroerd.
export function SampleReview({
  runId,
  status,
  items,
  verdictAction,
  publishAction,
  rejectAction,
}: {
  runId: string;
  status: RunStatus;
  items: SampleItem[];
  verdictAction: FormAction;
  publishAction: FormAction;
  rejectAction: FormAction;
}) {
  const published = status !== "steekproef";
  const foutCount = items.filter((i) => i.sampleVerdict === "fout").length;
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Deze run heeft geen steekproef-items — de parser vond niets in de
          productnamen van dit merk.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Veld</TableHead>
              <TableHead>Waarde</TableHead>
              <TableHead className="text-right">Oordeel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="max-w-72 whitespace-normal font-medium">
                  {it.productName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {it.field}
                </TableCell>
                <TableCell className="tabular-nums">{it.value}</TableCell>
                <TableCell className="text-right">
                  {published ? (
                    <span className="text-xs text-muted-foreground">
                      {it.sampleVerdict ?? "—"}
                    </span>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <form action={verdictAction}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <input type="hidden" name="runId" value={runId} />
                        <input type="hidden" name="verdict" value="goed" />
                        <Button
                          type="submit"
                          size="xs"
                          variant={
                            it.sampleVerdict === "goed" ? "secondary" : "outline"
                          }
                          aria-pressed={it.sampleVerdict === "goed"}
                        >
                          <IconCheck /> Goed
                        </Button>
                      </form>
                      <form action={verdictAction}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <input type="hidden" name="runId" value={runId} />
                        <input type="hidden" name="verdict" value="fout" />
                        <Button
                          type="submit"
                          size="xs"
                          variant={
                            it.sampleVerdict === "fout"
                              ? "destructive"
                              : "ghost"
                          }
                          aria-pressed={it.sampleVerdict === "fout"}
                        >
                          Fout
                        </Button>
                      </form>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!published && (
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {foutCount > 0
              ? `${foutCount} item(s) als fout gemarkeerd — die worden niet toegepast.`
              : "Publiceren vult de lege matchvelden en hermatcht blauwe regels van dit merk."}
          </p>
          <div className="flex items-center gap-2">
            <form action={rejectAction}>
              <input type="hidden" name="runId" value={runId} />
              <Button type="submit" size="sm" variant="ghost">
                Verwerpen
              </Button>
            </form>
            <form action={publishAction}>
              <input type="hidden" name="runId" value={runId} />
              <Button type="submit" size="sm">
                Publiceren
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
