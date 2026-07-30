// Data-werkbank — overzicht (run 5, §3.13). Intern beheer, buiten de dossier-layout → eigen
// <main>. Toont de Tier-2-dekkingsmeter en de ingangen naar de subpagina's.
import { db } from "@/db/client";
import { CoverageMeter } from "@/components/data/coverage-meter";
import { DataCards } from "@/components/data/data-cards";
import { isCoverageGap } from "@/components/data/price-list-status";
import {
  getTier2Coverage,
  listEnrichmentRuns,
  listPriceListStatus,
} from "@/lib/repo/enrichment";
import { requireSession } from "@/lib/session";

export default async function DataPage() {
  await requireSession();
  const [coverage, runs, priceLists] = await Promise.all([
    getTier2Coverage(db),
    listEnrichmentRuns(db),
    listPriceListStatus(db),
  ]);

  const openRuns = runs.filter((r) => r.status === "steekproef").length;
  // Dezelfde predicate als de tint van de rij op /data/price-lists — geïmporteerd, niet
  // nagebouwd. Tot 30 jul telde deze badge alleen `bucket === "verlopen"` en las hij dus "1"
  // naast een scherm dat "1 expired · 30 with 0 products — coverage gaps" meldde. Twee
  // schermen, één definitie van een dekkingsgat; anders lopen ze weer uit elkaar.
  const gaps = priceLists.filter(isCoverageGap).length;

  const badge: Record<string, number> = {
    "/data/enrichment": openRuns,
    "/data/price-lists": gaps,
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
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
