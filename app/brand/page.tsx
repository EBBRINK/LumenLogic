import { db } from "@/db/client";
import { BrandOverview } from "@/components/merk/brand-overview";
import { resolveBrandFromParam } from "@/lib/repo/brand-portal";
import { requireSession } from "@/lib/session";

// Merkportaal-landing (§3.16). Buiten de dossier-layout → rendert zijn eigen <main>.
// Welk merk het portaal toont, beslist resolveBrandFromParam — inclusief de uuid-guard
// op ?brand= (UX-audit 30 jul, bug #1). Die resolver stond hier en in de drie zustertabs
// byte-identiek; hij woont nu één keer in lib/repo/brand-portal.ts, want de eerste
// reparatieronde raakte alleen deze kopie en liet de andere drie op 500 staan.

export default async function MerkPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandId } = await searchParams;
  const brand = await resolveBrandFromParam(db, brandId);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Brand portal</h1>
        <p className="text-sm text-muted-foreground">
          Submit data and price lists and see aggregated how your products perform.
        </p>
      </header>
      {brand ? (
        <BrandOverview brandName={brand.name} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No brand linked to this portal yet.
        </p>
      )}
    </main>
  );
}
