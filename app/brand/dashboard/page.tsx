import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { BrandDashboard } from "@/components/merk/brand-dashboard";
import { getBrandAggregates, resolveBrandFromParam } from "@/lib/repo/brand-portal";
import { refreshAggregatesAction } from "../actions";
import { bewaakRoute } from "@/lib/route-toegang";

// Geaggregeerd dashboard (K-05). De materialized view is de anonimiseringsgrens: het merk
// ziet enkel zijn eigen totaal (overwogen/gekozen), nooit een onderliggend project.
// Welk merk, beslist resolveBrandFromParam — inclusief de uuid-guard op ?brand=. Deze
// pagina had zijn eigen kopie van die resolver zónder guard, dus
// /brand/dashboard?brand=nope gaf een 500 (UX-audit 30 jul, bug #1).

export default async function MerkDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await bewaakRoute("/brand/dashboard");
  const { brand: brandParam } = await searchParams;
  const brand = await resolveBrandFromParam(db, brandParam);
  const aggregates = await getBrandAggregates(db);
  const own = brand
    ? aggregates.find((a) => a.brandName === brand.name)
    : undefined;
  const data = { considered: own?.considered ?? 0, chosen: own?.chosen ?? 0 };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link
        href="/brand"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Brand portal
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </header>
      {brand ? (
        <BrandDashboard
          brandName={brand.name}
          data={data}
          refreshAction={refreshAggregatesAction}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No brand linked to this portal yet.
        </p>
      )}
    </main>
  );
}
