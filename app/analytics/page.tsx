// De Analytics-pagina op echte events (sprint 2.1 + 2.2, docs/plan-2.1-2.2-analytics.md).
// De 2.0b-placeholdertegels ("Coming soon") zijn hier vervangen door de negen echte tegels.
// Geschrapt bij besluit Timo 30 jul: `Fixtures → XIS` en `XIS-recognised projects` (de
// XIS-koppeling bestaat niet — `xis_exports` is leeg en de keys liggen bij Lynx) en
// `Becoming the expert` (geen query, geen afgesproken definitie).
//
// Server component: één query op de server, alles als prop naar de view. Geen "use client".
// Geen terugkoppel-link: /analytics is een top-level item in components/nav-items.ts en had er
// ook in 2.0b geen (vgl. /data/event-log, dat als subpagina wél "← Data" draagt).
//
// Aanroep zonder opties = intern, alles: geen org-scope en geen anonimiseringsgrens. Die twee
// parameters staan klaar in `getAnalyticsTiles` voor het merkportaal van week 3.
import { db } from "@/db/client";
import { AnalyticsTilesView } from "@/components/analytics/analytics-tiles";
import { getAnalyticsTiles } from "@/lib/repo/analytics-tiles";
import { requireSession } from "@/lib/session";

export default async function AnalyticsPage() {
  await requireSession();

  const data = await getAnalyticsTiles(db);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          What is searched, matched and considered — read straight from the event
          log. Read-only.
        </p>
      </header>
      <AnalyticsTilesView data={data} />
    </main>
  );
}
