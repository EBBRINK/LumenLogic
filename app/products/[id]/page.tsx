import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getProductForDisclosure } from "@/lib/repo/disclosure";
import { requireUuid } from "@/lib/uuid";
import { getSession } from "@/lib/session";
import { ProductCard, objectiveFields } from "@/components/product/product-card";
import { AddToCompareButton, CompareTray } from "@/components/product/compare-tray";
import { requestPriceAction } from "./actions";

// Productdetail met tier-gating (J-01…J-05, flow §4.11). Eigen <main> (buiten het dossier).
// De kijker-context (V1): intern = er is een sessie (alle ingelogde gebruikers zijn intern);
// hasApprovedProject blijft voorlopig false. Zonder sessie is de kijker extern → tier2-prijs
// wordt gated ("Prijs via Brink aanvragen"). De disclosure-repo bepaalt wat zichtbaar is;
// deze pagina toont het alleen.
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pricerequest?: string }>;
}) {
  const { id } = await params;
  // id gaat als uuid in visible_specs.id / visible_products.id. Deze pagina is de
  // enige zonder requireSession (tier-gating doet het werk), dus de guard staat hier
  // vóór álles: een externe bezoeker met een kapotte link hoort óók 404 te zien.
  requireUuid(id);
  const { pricerequest } = await searchParams;
  const session = await getSession();
  const ctx = { internal: Boolean(session), hasApprovedProject: false };

  const result = await getProductForDisclosure(db, id, ctx);
  if (!result) notFound();
  const { spec, disclosure, price, overrides } = result;

  // Prijsvrije objectieve velden voor de vergelijk-tray (respecteert dezelfde zichtbaarheid).
  const compareFields = objectiveFields(spec, disclosure, overrides);
  const canCompare = Object.keys(compareFields).length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 pb-32">
      <div className="mb-4">
        <Link href="/catalog" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to catalog
        </Link>
      </div>

      {pricerequest === "sent" && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm">
          Your price request is ready at Brink. You'll hear from us as soon as the list price is known.
        </div>
      )}

      <ProductCard
        spec={spec}
        disclosure={disclosure}
        price={price}
        overrides={overrides}
        requestAction={requestPriceAction}
      />

      {canCompare && (
        <div className="mt-4">
          <AddToCompareButton
            item={{
              id: String(spec.id ?? id),
              name: spec.name ?? "Unnamed product",
              brandName: spec.brandName,
              fields: compareFields,
            }}
          />
        </div>
      )}

      <CompareTray />
    </main>
  );
}
