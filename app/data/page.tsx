// Data-werkbank — overzicht (run 5, §3.13). Intern beheer, buiten de dossier-layout → eigen
// <main>. Toont de Tier-2-dekkingsmeter en de ingangen naar de subpagina's.
import Link from "next/link";
import { db } from "@/db/client";
import { CoverageMeter } from "@/components/data/coverage-meter";
import {
  getTier2Coverage,
  listBrandLoadQueue,
  listEnrichmentRuns,
  listPriceListStatus,
} from "@/lib/repo/enrichment";
import { requireSession } from "@/lib/session";

const CARDS: { href: string; title: string; desc: string }[] = [
  {
    href: "/data/verrijking",
    title: "Verrijking",
    desc: "Parser over merknamen, steekproef controleren en publiceren.",
  },
  {
    href: "/data/inladen",
    title: "Inladen",
    desc: "Blauw-wachtrij: gevraagde merken die nog niet in de catalogus staan.",
  },
  {
    href: "/data/prijslijsten",
    title: "Prijslijsten",
    desc: "Verloopt-binnenkort en verlopen lijsten (dekkingsgaten).",
  },
  {
    href: "/data/evaluatie",
    title: "Evaluatie",
    desc: "Hit-rate van de matcher meten tegen de evaluatieset.",
  },
];

export default async function DataPage() {
  await requireSession();
  const [coverage, runs, queue, priceLists] = await Promise.all([
    getTier2Coverage(db),
    listEnrichmentRuns(db),
    listBrandLoadQueue(db),
    listPriceListStatus(db),
  ]);

  const openRuns = runs.filter((r) => r.status === "steekproef").length;
  const waiting = queue.filter((q) => q.status === "wachtend").length;
  const expired = priceLists.filter((p) => p.bucket === "verlopen").length;

  const badge: Record<string, number> = {
    "/data/verrijking": openRuns,
    "/data/inladen": waiting,
    "/data/prijslijsten": expired,
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          De werkbank achter de matcher: catalogusdata verrijken, merken inladen
          en de kwaliteit meten.
        </p>
      </header>

      <div className="mb-8 max-w-md">
        <CoverageMeter
          total={coverage.total}
          covered={coverage.covered}
          ratio={coverage.ratio}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{c.title}</h2>
              {badge[c.href] > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-100 px-1.5 text-xs font-medium text-sky-800 tabular-nums dark:bg-sky-950 dark:text-sky-300">
                  {badge[c.href]}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
