import Link from "next/link";
import { db } from "@/db/client";
import {
  BrandsListBlock,
  type BrandListRow,
} from "@/components/admin/brands-list-block";
import { BrandFilterBar } from "@/components/admin/brand-filter-bar";
import { listBrandsWithTier } from "@/lib/repo/admin";
import type { BrandLifecycle } from "@/db/schema";
import { requireSession } from "@/lib/session";

const PHASES: BrandLifecycle[] = ["actief", "slapend", "bestaat_niet_meer"];

function parsePhase(raw: string | string[] | undefined): BrandLifecycle | "" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && (PHASES as string[]).includes(v) ? (v as BrandLifecycle) : "";
}

function parseQ(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? "").trim();
}

// MERKEN & TIERS (§3.16, J-02/J-04) + merkbeheer (sprint 1.5). Leeft buiten de
// dossier-layout → eigen <main>. Filteren gebeurt server-side via de querystring
// (`?q=`, `?phase=`): de URL is de filterstand.
export default async function AdminMerkenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();

  const sp = await searchParams;
  const q = parseQ(sp.q);
  const phase = parsePhase(sp.phase);

  const brands = await listBrandsWithTier(db, {
    q: q || undefined,
    lifecycle: phase || undefined,
  });
  // Sprint 2.0a (blok 3): disclosure-tier en per-veld-overrides zijn verhuisd naar
  // /data/brand-relations/[brandId] (Visibility-sectie). Dit scherm is nu puur
  // merkbeheer — geen N+1 meer over listBrandFieldOverrides (bijvangst, niet het doel).
  const rows: BrandListRow[] = brands.map((b) => ({
    id: b.id,
    name: b.name,
    brandCode: b.brandCode,
    lifecycle: b.lifecycle,
    productCount: b.productCount,
    priceListValidUntil: b.priceListValidUntil,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="text-sm text-muted-foreground">
            Add, edit and delete brands.
          </p>
        </div>
        <Link
          href="/admin/brands/new"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New brand
        </Link>
      </header>
      <BrandFilterBar q={q} phase={phase} shown={rows.length} />
      <BrandsListBlock brands={rows} />
    </main>
  );
}
