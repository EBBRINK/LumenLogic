import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/lib/format";
import type { SpecLineRow } from "./types";

function StatusBadge({ status }: { status: SpecLineRow["status"] }) {
  if (status === "matched") return <Badge>Gematcht</Badge>;
  if (status === "no_match")
    return <Badge variant="destructive">Geen match</Badge>;
  return <Badge variant="secondary">Open</Badge>;
}

export function SpecLineTable({
  dossierId,
  lines,
  deleteAction,
}: {
  dossierId: string;
  lines: SpecLineRow[];
  deleteAction?: (formData: FormData) => void | Promise<void>;
}) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen spec-regels. Voeg ze hieronder toe of plak een CSV-blok.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Aantal</TableHead>
          <TableHead>Gevraagd</TableHead>
          <TableHead>Match uit catalogus</TableHead>
          <TableHead className="text-right">Stukprijs</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="font-medium">{l.fixtureCode}</TableCell>
            <TableCell>{l.quantity}</TableCell>
            <TableCell className="max-w-56 whitespace-normal">
              <span className="text-muted-foreground">{l.brandText}</span>{" "}
              {l.productText}
            </TableCell>
            <TableCell className="max-w-64 whitespace-normal">
              {l.matchedName ? (
                <span>
                  <span className="text-muted-foreground">{l.matchedBrand}</span>{" "}
                  {l.matchedName}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatEur(l.matchedPrice)}
            </TableCell>
            <TableCell>
              <StatusBadge status={l.status} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dossiers/${dossierId}/regel/${l.id}`}>
                    <Search /> Matchen
                  </Link>
                </Button>
                {deleteAction && (
                  <form action={deleteAction}>
                    <input type="hidden" name="dossierId" value={dossierId} />
                    <input type="hidden" name="specLineId" value={l.id} />
                    <Button
                      type="submit"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Regel verwijderen"
                    >
                      <Trash2 />
                    </Button>
                  </form>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
