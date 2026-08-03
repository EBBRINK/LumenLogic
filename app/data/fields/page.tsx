// Eigen productvelden (sprint 1.8). Stefan kan hier een veld toevoegen dat hij aan merken
// wil vragen, zonder programmeur — het verschijnt als extra kolom in het merk-Excel en als
// rij in de scorecard.
//
// DE GRENS DIE DIT SCHERM BEWAAKT (docs/milieuvelden-toevoegen.md):
// een eigen veld wordt NOOIT door de matcher gelezen. De waarden leven in
// products.custom_values, en `visible_products` — de enige bron van de match-engine —
// heeft een expliciete kolomlijst zonder die kolom. Dat is een structurele grens, geen
// afspraak. Wie wél een matcher-veld wil, heeft een migratie nodig; dat blijft
// programmeerwerk.
//
// Het overzicht van de bestaande catalogusvelden staat er bewust bovenaan: dáár zie je dat
// het veld dat je wilt toevoegen er al is (plan §7).
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import {
  CatalogFieldsOverview,
  CustomFieldsTable,
  type CatalogusOverzichtBucket,
  type EigenVeldRij,
} from "@/components/data/custom-fields-table";
import type { BucketOptie } from "@/components/data/custom-field-form";
import {
  excelColumns,
  templateBuckets,
  FIELD_CATALOG,
  INTERNAL_BUCKET_KEY,
} from "@/lib/field-catalog";
import {
  laadCatalogus,
  listEigenVelden,
  telProductenMetWaarde,
} from "@/lib/repo/custom-fields";
import {
  archiveCustomFieldAction,
  countProductsWithValueAction,
  createCustomFieldAction,
  updateCustomFieldAction,
} from "./actions";
import { bewaakRoute } from "@/lib/route-toegang";

// De 10 template-buckets. "intern" (bucket 11) staat er nooit bij: dat is per definitie
// wat we NIET aan het merk vragen, en een eigen veld is altijd een vraag aan het merk.
const TEMPLATE_BUCKETS = FIELD_CATALOG.filter(
  (b) => b.key !== INTERNAL_BUCKET_KEY,
).sort((a, b) => a.order - b.order);

const BUCKET_OPTIES: BucketOptie[] = TEMPLATE_BUCKETS.map((b) => ({
  key: b.key,
  labelEn: b.labelEn,
  order: b.order,
}));

const OVERZICHT: CatalogusOverzichtBucket[] = templateBuckets(FIELD_CATALOG).map(
  ({ bucket, fields }) => ({
    key: bucket.key,
    order: bucket.order,
    labelEn: bucket.labelEn,
    fields: fields.map((f) => ({
      key: f.key,
      labelEn: f.labelEn,
      niveau: f.niveau,
    })),
  }),
);

const CATALOGUS_KOLOMMEN = excelColumns(FIELD_CATALOG).length;

export default async function EigenVeldenPage() {
  await bewaakRoute("/data/fields");
  const [eigen, tellingen, catalogus] = await Promise.all([
    listEigenVelden(db, { metGearchiveerd: true }),
    telProductenMetWaarde(db),
    laadCatalogus(db),
  ]);

  const bucketVan = new Map(
    TEMPLATE_BUCKETS.map((b) => [b.key, { order: b.order, labelEn: b.labelEn }]),
  );

  const rows: EigenVeldRij[] = eigen.map((def) => {
    const bucket = bucketVan.get(def.bucketKey);
    return {
      id: def.id,
      labelEn: def.labelEn,
      instructionEn: def.instructionEn,
      niveau: def.niveau,
      bucketKey: def.bucketKey,
      bucketOrder: bucket?.order ?? 0,
      // Een onbekende bucket-key is geen reden om de rij te verzwijgen: laat hem zien
      // met de kale sleutel, dan is het zichtbaar in plaats van stil.
      bucketLabelEn: bucket?.labelEn ?? def.bucketKey,
      productsWithValue: tellingen.get(def.id) ?? 0,
      createdAt: def.createdAt,
      archivedAt: def.archivedAt,
    };
  });

  // De groei zichtbaar maken: 66 gevraagde kolommen + wat wij erbij zetten.
  const totaalKolommen = excelColumns(catalogus).length;
  const eigenKolommen = totaalKolommen - CATALOGUS_KOLOMMEN;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Data
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Fields</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Everything we ask brands for, plus the fields you add yourself. An own
          field becomes a column in the brand Excel and a row in the scorecard —
          it is never read by the matcher. Per-brand visibility of existing
          fields is a different thing and lives elsewhere.
        </p>
        <p className="mt-2 text-sm">
          <span className="font-medium">Brand Excel:</span>{" "}
          <span className="tabular-nums">{CATALOGUS_KOLOMMEN}</span> +{" "}
          <span className="tabular-nums">{eigenKolommen}</span> columns
        </p>
      </header>

      <div className="mb-6">
        <CatalogFieldsOverview buckets={OVERZICHT} />
      </div>

      <CustomFieldsTable
        rows={rows}
        buckets={BUCKET_OPTIES}
        createAction={createCustomFieldAction}
        updateAction={updateCustomFieldAction}
        telAction={countProductsWithValueAction}
        archiveerAction={archiveCustomFieldAction}
      />
    </main>
  );
}
