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
import { dismissBrandLoadAction, markLoadedAction } from "./actions";
import { bewaakRoute } from "@/lib/route-toegang";

export default async function InladenPage() {
  await bewaakRoute("/admin/loading");
  const queue = await listBrandLoadQueue(db);
  const rows: QueueRow[] = queue.map((q) => ({
    id: q.id,
    displayName: q.displayName,
    frequency: q.frequency,
    status: q.status as "wachtend" | "ingeladen",
    loadedAt: q.loadedAt,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Admin
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Loading</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Brands requested as a data gap (blue) but not yet in the catalog. The
          frequency counts how often they appear across all projects — load the
          most requested first. Something that was never a brand (a zone or room
          name the import misread) can be taken off the queue with &quot;Not a
          brand&quot;.
        </p>
      </header>
      <BrandLoadQueue
        rows={rows}
        markLoadedAction={markLoadedAction}
        dismissAction={dismissBrandLoadAction}
      />
    </main>
  );
}
