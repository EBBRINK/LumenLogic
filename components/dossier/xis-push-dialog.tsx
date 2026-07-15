"use client";

// XIS-push (E-09…E-12, functioneel ontwerp §3.9). De dialoog toont de pre-flight-
// samenvatting: hoeveel echte artikelen, tekstregels en nog-aan-te-maken producten er
// meegaan. Niets wordt weggelaten — rood, paars en blauw gaan mee als tekstregel
// (zichtbaar, zonder artikel). Sandbox is default (NFR 7). De human tikt zelf op
// "Verstuur naar XIS" — de export gebeurt nooit vanzelf.
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type PreflightSummary = {
  productLines: number;
  textLines: number;
  newProducts: number;
  total: number;
};

export type ExistingExport = {
  environment: string;
  createdAt: string; // reeds als NL-datumstring geformatteerd door de pagina
  status: string;
} | null;

// Print/PDF-knop (NFR 4). window.print laat de browser de estimate afdrukken; de
// action-balk zelf staat op print:hidden zodat alleen de estimate op papier komt.
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      Print / PDF
    </Button>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function XisPushDialog({
  dossierId,
  preflight,
  existing,
  action,
}: {
  dossierId: string;
  preflight: PreflightSummary;
  existing?: ExistingExport;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          → To XIS
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to XIS</DialogTitle>
          <DialogDescription>
            Sandbox. Nothing is omitted — red, purple and blue go along as text lines
            (visible, without an article), so the request stays complete.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <Row label="Article lines" value={preflight.productLines} />
          <Row label="New products (still to create in XIS)" value={preflight.newProducts} />
          <Row label="Text lines (blue/red/purple/open)" value={preflight.textLines} muted />
          <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
            <span>Total lines</span>
            <span className="tabular-nums">{preflight.total}</span>
          </div>
        </div>

        {existing ? (
          <DialogFooter>
            <p className="w-full text-sm text-muted-foreground">
              Already sent — {existing.createdAt}{" "}
              <span className="text-xs">
                ({existing.environment}, {existing.status})
              </span>
            </p>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <form action={action}>
              <input type="hidden" name="dossierId" value={dossierId} />
              <input type="hidden" name="environment" value="sandbox" />
              <Button type="submit" size="sm">
                Send to XIS
              </Button>
            </form>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
