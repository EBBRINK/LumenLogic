// Data-werkbank — overzicht (run 5, §3.13). Intern beheer, buiten de dossier-layout → eigen
// <main>. Toont de Tier-2-dekkingsmeter en de ingangen naar de subpagina's.
import { db } from "@/db/client";
import { CoverageMeter } from "@/components/data/coverage-meter";
import { DataCards } from "@/components/data/data-cards";
import {
  getTier2Coverage,
  listBrandLoadQueue,
  listEnrichmentRuns,
  listPriceListStatus,
} from "@/lib/repo/enrichment";
import { listBrandRelations } from "@/lib/repo/brand-relations";
import { requireSession } from "@/lib/session";

export default async function DataPage() {
  await requireSession();
  const [coverage, runs, queue, priceLists, relations] = await Promise.all([
    getTier2Coverage(db),
    listEnrichmentRuns(db),
    listBrandLoadQueue(db),
    listPriceListStatus(db),
    listBrandRelations(db),
  ]);

  const openRuns = runs.filter((r) => r.status === "steekproef").length;
  const waiting = queue.filter((q) => q.status === "wachtend").length;
  const expired = priceLists.filter((p) => p.bucket === "verlopen").length;
  // Badge = werk te verwerken: merken waarvan de data binnen is (K3).
  const dataOntvangen = relations.filter(
    (r) => r.status === "data_ontvangen",
  ).length;

  const badge: Record<string, number> = {
    "/data/enrichment": openRuns,
    "/data/loading": waiting,
    "/data/price-lists": expired,
    "/data/brand-relations": dataOntvangen,
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The workbench behind the matcher: enrich catalog data, load brands and
          measure quality.
        </p>
      </header>

      <div className="mb-8 max-w-md">
        <CoverageMeter
          total={coverage.total}
          covered={coverage.covered}
          ratio={coverage.ratio}
        />
      </div>

      <DataCards badge={badge} />
    </main>
  );
}
