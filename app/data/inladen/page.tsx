// Inladen — blauw-wachtrij (H-08). Gevraagde merken die nog niet in de catalogus staan,
// op frequentie. "Markeer als ingeladen" hermatcht meteen de blauwe/open regels van dat merk.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import {
  BrandLoadQueue,
  type QueueRow,
} from "@/components/data/brand-load-queue";
import { listBrandLoadQueue } from "@/lib/repo/enrichment";
import { requireSession } from "@/lib/session";
import { markLoadedAction } from "../actions";

export default async function InladenPage() {
  await requireSession();
  const queue = await listBrandLoadQueue(db);
  const rows: QueueRow[] = queue.map((q) => ({
    id: q.id,
    displayName: q.displayName,
    frequency: q.frequency,
    status: q.status as "wachtend" | "ingeladen",
    loadedAt: q.loadedAt,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Data
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Inladen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Merken die als datagat (blauw) gevraagd zijn maar nog niet in de
          catalogus staan. De frequentie telt hoe vaak ze over alle projecten
          voorkomen — laadt de meest gevraagde eerst.
        </p>
      </header>
      <BrandLoadQueue rows={rows} markLoadedAction={markLoadedAction} />
    </main>
  );
}
