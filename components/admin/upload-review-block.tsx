import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type UploadReviewRow = {
  id: string;
  brandName: string | null;
  kind: string; // 'pricelist' | 'data'
  submittedBy: string | null;
  createdAt: string; // ISO
};

// De merken waaraan een PDL-import gehangen kan worden (voor de stub-import-selectie).
export type PdlBrandOption = { id: string; name: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const KIND_LABEL: Record<string, string> = {
  pricelist: "Prijslijst",
  data: "Productdata",
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
        <CardTitle>Uploads in afwachting</CardTitle>
        <p className="text-sm text-muted-foreground">
          Prijslijsten en productdata staan in staging tot goedkeuring. Afwijzen
          vraagt altijd een reden.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen uploads in afwachting.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merk</TableHead>
                <TableHead>Soort</TableHead>
                <TableHead>Ingediend door</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Actie</TableHead>
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
                          Goedkeuren
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
                          placeholder="Reden"
                          aria-label={`Reden voor afwijzen upload ${u.id}`}
                          className="h-8 w-32"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Afwijzen
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
              PDL / ConnectingTheDots-import
            </label>
            <select
              id="pdl-brand"
              name="brandId"
              required
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs dark:bg-input/30"
            >
              <option value="">Kies merk…</option>
              {pdlBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" className="self-start">
            Importeer als staging
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Een import landt als staging-upload en gaat pas na goedkeuring de
          catalogus in — nooit stilzwijgend.
        </p>
      </CardContent>
    </Card>
  );
}
