import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import type { MatchStatus } from "./status";
import type { Phase } from "./types";

export type ArmatuurRow = {
  fixtureCode: string;
  quantity: number | null;
  brand: string | null;
  productName: string | null;
  articleCode: string | null;
  kelvin: number | null;
  cri: number | null;
  ip: string | null;
  status: MatchStatus;
};

// Wat er in de productkolom komt als er (nog) geen echt product hangt: nooit stil
// weglaten, altijd eerlijk benoemen wát er aan de hand is (ijzeren regel: ontbrekende
// data ≠ fout). Alleen groen/geel hebben een gekozen product; de rest krijgt tekst.
function noProductText(status: MatchStatus): string {
  switch (status) {
    case "rood":
      return "geen match in catalogus";
    case "blauw":
      return "merk nog niet ingeladen";
    case "paars":
      return "buiten assortiment";
    default:
      return "nog niet gematcht"; // open (en veilige fallback)
  }
}

// Gecodeerd armaturenboek (de derde rol, projectleider): verrassingsvrije overdracht naar
// de bouwplaats. Per armatuurcode het gekozen product met artikelnummer en kernspecs.
// Onopgeloste regels staan er eerlijk in met hun status — niets wordt weggelaten.
export function ArmaturenboekView({
  dossierName,
  customer,
  rows,
}: {
  dossierName: string;
  customer: string | null;
  phase?: Phase;
  rows: ArmatuurRow[];
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 border-b pb-4">
        <p className="text-sm text-muted-foreground">Armaturenboek</p>
        <h1 className="text-2xl font-semibold tracking-tight">{dossierName}</h1>
        {customer && <p className="text-sm text-muted-foreground">{customer}</p>}
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead className="text-right">Aantal</TableHead>
            <TableHead>Merk</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Artikelnr.</TableHead>
            <TableHead>Kleurtemp.</TableHead>
            <TableHead>CRI</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const hasProduct = r.status === "groen" || r.status === "geel";
            return (
              <TableRow key={r.fixtureCode}>
                <TableCell className="font-medium">{r.fixtureCode}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.quantity ?? "—"}
                </TableCell>
                <TableCell>{r.brand ?? "—"}</TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  {hasProduct && r.productName ? (
                    r.productName
                  ) : (
                    <span className="text-muted-foreground">
                      {noProductText(r.status)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {hasProduct ? (r.articleCode ?? "—") : "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {r.kelvin ? `${r.kelvin}K` : "—"}
                </TableCell>
                <TableCell className="tabular-nums">{r.cri ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{r.ip ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <p className="mt-6 text-xs text-muted-foreground">
        Overdrachtsdocument voor de bouwplaats. Specs zoals door het merk opgegeven;
        onopgeloste regels staan er eerlijk in met hun status.
      </p>
    </div>
  );
}
