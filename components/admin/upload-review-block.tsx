import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export type UploadReviewRow = {
  id: string;
  brandName: string | null;
  kind: string; // 'pricelist' | 'data'
  submittedBy: string | null;
  createdAt: string; // ISO
};

// De merken waaraan een PDL-import gehangen kan worden (voor de stub-import-selectie).
export type PdlBrandOption = { id: string; name: string };

// UX-audit 30 jul (bug #9): hier stond een eigen `toLocaleDateString("nl-NL")` ("1 jul
// 2026"). Eén datumformatter voor de hele app, in lib/format.ts.

const KIND_LABEL: Record<string, string> = {
  pricelist: "Price list",
  data: "Product data",
};

// MERK-UPLOADS (§3.16, H-11): één publicatiepad. Alles wat een merk (of de PDL-import)
// aanlevert, staat hier in staging tot de binnendienst het goedkeurt of afwijst. Afwijzen
// draagt altijd een reden — een afwijzing zonder reden is geen data. Niets gaat stilzwijgend
// de catalogus in.
export function UploadReviewBlock({
  uploads,
  pdlBrands,
  approveAction,
  rejectAction,
  pdlImportAction,
}: {
  uploads: UploadReviewRow[];
  pdlBrands: PdlBrandOption[];
  approveAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
  pdlImportAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending uploads</CardTitle>
        <p className="text-sm text-muted-foreground">
          Price lists and product data stay in staging until approval. Rejecting
          always requires a reason.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {uploads.length === 0 ? (
          // Zit al in een <Card>: inline. Geen actie — deze wachtrij vult zichzelf
          // vanuit de merkportalen; de admin start hier niets.
          <EmptyState
            variant="inline"
            title="No pending uploads."
            action={null}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.brandName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {KIND_LABEL[u.kind] ?? u.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.submittedBy ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <form action={approveAction}>
                        <input type="hidden" name="uploadId" value={u.id} />
                        <Button type="submit" size="sm">
                          Approve
                        </Button>
                      </form>
                      <form
                        action={rejectAction}
                        className="flex items-center gap-1.5"
                      >
                        <input type="hidden" name="uploadId" value={u.id} />
                        <Input
                          type="text"
                          name="note"
                          required
                          placeholder="Reason"
                          aria-label={`Reason for rejecting upload ${u.id}`}
                          className="h-8 w-32"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Reject
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <form
          action={pdlImportAction}
          className="flex flex-col gap-2 border-t border-foreground/10 pt-4 sm:flex-row sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pdl-brand" className="text-sm font-medium">
              PDL / ConnectingTheDots import
            </label>
            <select
              id="pdl-brand"
              name="brandId"
              required
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs dark:bg-input/30"
            >
              <option value="">Choose brand…</option>
              {pdlBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" className="self-start">
            Import as staging
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          An import lands as a staging upload and only enters the catalog after
          approval — never silently.
        </p>
      </CardContent>
    </Card>
  );
}
