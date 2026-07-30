// Merkrelatie-detail (stap 5): volledige compleetheids-scorecard (één
// getBrandCompleteness-call — geen per-bucket-queries) + relatievelden bewerken.
// Sprint 2.0a (blok 3): de toestemmings-as (disclosure) is hierheen verhuisd — zie de
// Visibility-sectie onderaan.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brandRelations, brands, priceLists } from "@/db/schema";
import { BrandMessageBlock } from "@/components/data/brand-message-block";
import { BrandRelationForm } from "@/components/data/brand-relation-form";
import { BrandVisibilityBlock } from "@/components/data/brand-visibility-block";
import { TemplateDownloadLink } from "@/components/data/template-download-link";
import { TemplateUploadCard } from "@/components/data/template-upload-card";
import { BrandScorecard } from "@/components/data/brand-scorecard";
import { PriceListExpiryNotice } from "@/components/data/price-list-expiry-notice";
import { buildBrandMessage } from "@/lib/brand-message";
import { listBrandFieldOverrides } from "@/lib/repo/admin";
import {
  getBrandCompleteness,
  priceListIndicator,
} from "@/lib/repo/brand-relations";
import { listBrandUploads } from "@/lib/repo/brand-portal";
import { requireUuid } from "@/lib/uuid";
import { requireSession } from "@/lib/session";
import {
  logBrandMessagePreparedAction,
  setFieldVisibilityAction,
  setTierAction,
  updateBrandRelationAction,
} from "../actions";
import { uploadTemplateAction } from "./upload-actions";

export default async function MerkrelatieDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  await requireSession();
  const { brandId } = await params;
  // Deze pagina was het bewijsstuk van bug #1: brandId ging ongefilterd in
  // eq(brands.id, …) — de rij-check hieronder deed het goed, de cast erboven niet.
  requireUuid(brandId);

  const [row] = await db
    .select({
      id: brands.id,
      name: brands.name,
      brandCode: brands.brandCode,
      disclosureTier: brands.disclosureTier,
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
  // Eén merk → geen N+1 (in tegenstelling tot de oude /admin/brands-lijst).
  const fieldOverrides = await listBrandFieldOverrides(db, brandId);

  // Open template-voorstellen van dít merk (retour-pad, sprint 1.2). Alleen 'staging':
  // een afgehandeld voorstel heeft geen werk meer en zou de lijst laten dichtslibben.
  // Alleen kind 'template': prijslijst-/data-uploads uit het merkportaal lopen via
  // /admin/imports en hebben hier geen voorstel-scherm.
  const openVoorstellen = (await listBrandUploads(db, brandId)).filter(
    (u) => u.kind === "template" && u.status === "staging",
  );

  // Bericht (stap 7): prijslijst-stand via dezelfde indicator-logica als het overzicht.
  const [latestList] = await db
    .select({ validUntil: sql<string | null>`max(${priceLists.validUntil})` })
    .from(priceLists)
    .where(eq(priceLists.brandId, brandId));
  const validUntil = latestList?.validUntil ?? null;
  const indicator = priceListIndicator(validUntil);
  const message = buildBrandMessage({
    brandName: row.name,
    contactName: row.contactName,
    productCount: completeness.productCount,
    priceListIndicator: indicator,
    priceListValidUntil: validUntil,
    buckets: completeness.buckets,
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/data/brand-relations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Brand relations
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
            Relationship, visibility and data completeness.
          </p>
        </div>
      </header>

      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <h2 className="mb-3 font-medium">Relationship</h2>
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

      <section className="mb-8">
        <BrandVisibilityBlock
          brandId={row.id}
          disclosureTier={row.disclosureTier}
          overrides={fieldOverrides}
          setTierAction={setTierAction}
          setFieldVisibilityAction={setFieldVisibilityAction}
        />
      </section>

      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Prepare message</h2>
          <TemplateDownloadLink />
        </div>
        <BrandMessageBlock
          brandId={row.id}
          message={message}
          onCopied={logBrandMessagePreparedAction}
        />
      </section>

      {/* Het retour-pad: de andere helft van "Prepare message" hierboven. Daar vraag je
          de data op, hier komt hij terug. */}
      <section className="mb-8">
        <TemplateUploadCard brandId={row.id} uploadAction={uploadTemplateAction} />

        {openVoorstellen.length > 0 && (
          <div className="mt-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
            <h2 className="mb-1 font-medium">Waiting for your review</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Uploaded and checked, but nothing from{" "}
              {openVoorstellen.length === 1 ? "this file" : "these files"} is in
              the catalogue yet.
            </p>
            <ul className="space-y-1">
              {openVoorstellen.map((upload) => (
                <li key={upload.id}>
                  <Link
                    href={`/data/brand-relations/${row.id}/upload/${upload.id}`}
                    className="text-sm underline underline-offset-4"
                  >
                    {String(upload.payload?.filename ?? "Filled template")}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {upload.createdAt.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-medium">Completeness</h2>
        {indicator === "verlopen" && (
          <div className="mb-4">
            <PriceListExpiryNotice
              indicator={indicator}
              validUntil={validUntil}
              variant="banner"
              brandName={row.name}
            />
          </div>
        )}
        <BrandScorecard aggregate={completeness.aggregate} />
      </section>
    </main>
  );
}
