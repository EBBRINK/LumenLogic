// Merkrelatie-detail (stap 5): volledige compleetheids-scorecard (één
// getBrandCompleteness-call — geen per-bucket-queries) + relatievelden bewerken.
// Kruislink naar /admin/brands: dáár woont de toestemmings-as (disclosure).
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brandRelations, brands, priceLists } from "@/db/schema";
import { BrandMessageBlock } from "@/components/data/brand-message-block";
import { BrandRelationForm } from "@/components/data/brand-relation-form";
import { TemplateDownloadLink } from "@/components/data/template-download-link";
import { BrandScorecard } from "@/components/data/brand-scorecard";
import { buildBrandMessage } from "@/lib/brand-message";
import {
  getBrandCompleteness,
  priceListIndicator,
} from "@/lib/repo/brand-relations";
import { requireSession } from "@/lib/session";
import {
  logBrandMessagePreparedAction,
  updateBrandRelationAction,
} from "../actions";

export default async function MerkrelatieDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  await requireSession();
  const { brandId } = await params;

  const [row] = await db
    .select({
      id: brands.id,
      name: brands.name,
      brandCode: brands.brandCode,
      status: brandRelations.status,
      contactName: brandRelations.contactName,
      contactEmail: brandRelations.contactEmail,
      lastContactAt: brandRelations.lastContactAt,
      notes: brandRelations.notes,
    })
    .from(brands)
    .leftJoin(brandRelations, eq(brandRelations.brandId, brands.id))
    .where(eq(brands.id, brandId))
    .limit(1);
  if (!row) notFound();

  const completeness = await getBrandCompleteness(db, brandId);

  // Bericht (stap 7): prijslijst-stand via dezelfde indicator-logica als het overzicht.
  const [latestList] = await db
    .select({ validUntil: sql<string | null>`max(${priceLists.validUntil})` })
    .from(priceLists)
    .where(eq(priceLists.brandId, brandId));
  const validUntil = latestList?.validUntil ?? null;
  const message = buildBrandMessage({
    brandName: row.name,
    contactName: row.contactName,
    productCount: completeness.productCount,
    priceListIndicator: priceListIndicator(validUntil),
    priceListValidUntil: validUntil,
    buckets: completeness.buckets,
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/data/brand-relations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Merkrelaties
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {row.name}
            {row.brandCode && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {row.brandCode}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Relatie en datacompleetheid. Toestemming (disclosure) beheer je op{" "}
            <Link href="/admin/brands" className="underline">
              Admin · Merken
            </Link>
            .
          </p>
        </div>
      </header>

      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <h2 className="mb-3 font-medium">Relatie</h2>
        <BrandRelationForm
          values={{
            brandId: row.id,
            status: row.status ?? "niet_benaderd",
            contactName: row.contactName,
            contactEmail: row.contactEmail,
            lastContactAt: row.lastContactAt,
            notes: row.notes,
          }}
          updateAction={updateBrandRelationAction}
        />
      </section>

      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Bericht klaarzetten</h2>
          <TemplateDownloadLink />
        </div>
        <BrandMessageBlock
          brandId={row.id}
          message={message}
          onCopied={logBrandMessagePreparedAction}
        />
      </section>

      <section>
        <h2 className="mb-3 font-medium">Compleetheid</h2>
        <BrandScorecard
          buckets={completeness.buckets}
          filledByField={completeness.filledByField}
          productCount={completeness.productCount}
          hasProducts={completeness.hasProducts}
        />
      </section>
    </main>
  );
}
