import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Phase } from "./types";

export type ArmatuurRow = {
  fixtureCode: string;
  quantity: number;
  brand: string | null;
  productName: string | null;
  articleCode: string | null;
  kelvin: number | null;
  cri: number | null;
  ip: string | null;
  status: "open" | "matched" | "no_match";
};

// Gecodeerd armaturenboek (de derde rol, projectleider): verrassingsvrije overdracht naar
// de bouwplaats. Per armatuurcode het gekozen product met artikelnummer en kernspecs.
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.fixtureCode}>
              <TableCell className="font-medium">{r.fixtureCode}</TableCell>
              <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
              <TableCell>{r.brand ?? "—"}</TableCell>
              <TableCell className="max-w-72 whitespace-normal">
                {r.status === "matched" ? (
                  r.productName
                ) : (
                  <span className="text-muted-foreground">
                    {r.status === "no_match" ? "geen match in catalogus" : "nog niet gematcht"}
                  </span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{r.articleCode ?? "—"}</TableCell>
              <TableCell className="tabular-nums">
                {r.kelvin ? `${r.kelvin}K` : "—"}
              </TableCell>
              <TableCell className="tabular-nums">{r.cri ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{r.ip ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="mt-6 text-xs text-muted-foreground">
        Overdrachtsdocument voor de bouwplaats. Specs zoals door het merk opgegeven.
      </p>
    </div>
  );
}
