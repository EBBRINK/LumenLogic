import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Wat een merk van zijn eigen data ziet (§3.16): de opgenomen producten met hun specs.
// Bewust GEEN prijs en GEEN ranking — dit is een spiegel van de techniek, niet een
// verkoopweergave. De volgorde is op naam, nooit op iets commercieels (ijzeren regel 2).
export type BrandProductRow = {
  id: string;
  name: string;
  articleCode: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  lumenOutput: number | null;
  status: string;
};

function cell(value: string | number | null): React.ReactNode {
  if (value == null || value === "") {
    // Ontbrekende data = eerlijke grijze vlag, nooit stilzwijgend weggelaten.
    return <span className="text-muted-foreground">—</span>;
  }
  return value;
}

export function BrandDataView({
  brandName,
  products,
}: {
  brandName: string;
  products: BrandProductRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The products of <span className="font-medium text-foreground">{brandName}</span> recorded
        in the catalog, with their technical specifications. No prices — this is the
        technical mirror.
      </p>
      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No products of this brand recorded yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Article code</TableHead>
              <TableHead className="text-right">Kelvin</TableHead>
              <TableHead className="text-right">CRI</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="text-right">Lumen</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{cell(p.articleCode)}</TableCell>
                <TableCell className="text-right">{cell(p.kelvin)}</TableCell>
                <TableCell className="text-right">{cell(p.cri)}</TableCell>
                <TableCell>{cell(p.ipValue)}</TableCell>
                <TableCell className="text-right">{cell(p.lumenOutput)}</TableCell>
                <TableCell>{cell(p.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
