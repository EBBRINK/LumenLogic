import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/lib/format";
import { PhaseBadge } from "./phase-badge";
import type { Phase, QuoteLineRow } from "./types";

export function QuoteView({
  dossierName,
  customer,
  phase,
  lines,
  total,
}: {
  dossierName: string;
  customer: string | null;
  phase: Phase;
  lines: QuoteLineRow[];
  total: number;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-sm text-muted-foreground">Offerte</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {dossierName}
          </h1>
          {customer && (
            <p className="text-sm text-muted-foreground">{customer}</p>
          )}
        </div>
        <div className="print:hidden">
          <PhaseBadge phase={phase} />
        </div>
      </header>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen gematchte, geprijsde regels. Match eerst spec-regels aan
          producten met een geldige prijs.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Aantal</TableHead>
              <TableHead className="text-right">Stukprijs</TableHead>
              <TableHead className="text-right">Totaal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.fixtureCode}</TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  {l.productName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.quantity}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatEur(l.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatEur(l.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="text-right font-medium">
                Totaal (excl. btw)
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatEur(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Brutoprijzen excl. btw uit geldige prijslijsten. Verlopen prijslijsten
        zijn uitgesloten — controleer bij twijfel de dagprijs.
      </p>
    </div>
  );
}
