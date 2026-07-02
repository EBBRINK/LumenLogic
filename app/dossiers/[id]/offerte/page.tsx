import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { QuoteView } from "@/components/dossier/quote-view";
import { Button } from "@/components/ui/button";
import { getDossier, getQuote } from "@/lib/repo/dossiers";
import { requireSession } from "@/lib/session";
import { generateQuoteAction } from "../../actions";

export default async function OffertePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const quote = await getQuote(db, id);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/dossiers/${dossier.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {dossier.name}
        </Link>
        <form action={generateQuoteAction}>
          <input type="hidden" name="dossierId" value={dossier.id} />
          <Button type="submit" variant="outline" size="sm">
            {quote ? "Offerte opnieuw genereren" : "Offerte genereren"}
          </Button>
        </form>
      </div>

      {quote ? (
        <QuoteView
          dossierName={dossier.name}
          customer={dossier.customer}
          phase={dossier.phase}
          lines={quote.lines.map((l) => ({
            id: l.id,
            fixtureCode: l.fixtureCode,
            productName: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          }))}
          total={quote.total}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nog geen offerte gegenereerd voor dit dossier.
        </p>
      )}
    </main>
  );
}
