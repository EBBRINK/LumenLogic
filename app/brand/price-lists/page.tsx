import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { PricelistUpload } from "@/components/merk/pricelist-upload";
import type { UploadRow } from "@/components/merk/pricelist-upload";
import { listBrandUploads, resolveBrandFromParam } from "@/lib/repo/brand-portal";
import { requireSession } from "@/lib/session";
import { submitUploadAction } from "../actions";

// Prijslijst-upload (H-11): verplichte valid_until → staging. Buiten de dossier-layout.
// Welk merk, beslist resolveBrandFromParam — inclusief de uuid-guard op ?brand=. Deze
// pagina had zijn eigen kopie van die resolver zónder guard, dus
// /brand/price-lists?brand=nope gaf een 500 (UX-audit 30 jul, bug #1).

export default async function MerkPrijslijstenPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  await requireSession();
  const { brand: brandParam } = await searchParams;
  const brand = await resolveBrandFromParam(db, brandParam);
  const uploads = brand ? await listBrandUploads(db, brand.id) : [];

  const rows: UploadRow[] = uploads.map((u) => {
    const validUntil = u.payload?.["valid_until"];
    return {
      id: u.id,
      kind: u.kind,
      status: u.status,
      validUntil: typeof validUntil === "string" ? validUntil : null,
      submittedBy: u.submittedBy,
      createdAt: u.createdAt.toISOString(),
    };
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/brand"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Brand portal
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Price lists</h1>
      </header>
      {brand ? (
        <PricelistUpload
          brandId={brand.id}
          brandName={brand.name}
          uploads={rows}
          submitAction={submitUploadAction}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No brand linked to this portal yet.
        </p>
      )}
    </main>
  );
}
