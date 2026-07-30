// Prijslijsten — verloopt-binnenkort + verlopen (dekkingsgaten). Ijzeren regel 3: een
// verlopen prijslijst maakt de producten onzichtbaar voor de matcher.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { PriceListStatusTable } from "@/components/data/price-list-status";
import { listPriceListStatus } from "@/lib/repo/enrichment";
import { requireSession } from "@/lib/session";

export default async function PrijslijstenPage() {
  await requireSession();
  // Geen cast: PriceListStatus is structureel toewijsbaar aan PriceListRow. Dat is precies de
  // bedoeling — dit is de énige plek waar de compiler nog controleert dat de query alle velden
  // levert die het scherm toont (o.a. lifecycle). Een `as PriceListRow[]` zou die controle
  // uitzetten en een vergeten kolom in de select stil laten passeren.
  const rows = await listPriceListStatus(db);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Data
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Price lists</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Validity at a glance. Expired lists are a coverage gap: their products
          drop out of the matcher until there's a new list.
        </p>
      </header>
      <PriceListStatusTable rows={rows} />
    </main>
  );
}
