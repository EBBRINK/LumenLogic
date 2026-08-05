import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getProductForDisclosure } from "@/lib/repo/disclosure";
import { requireUuid } from "@/lib/uuid";
import { bewaakRoute } from "@/lib/route-toegang";
import { ProductCard, objectiveFields } from "@/components/product/product-card";
import { AddToCompareButton, CompareTray } from "@/components/product/compare-tray";
import { requestPriceAction } from "./actions";

// Productdetail met tier-gating (J-01…J-05, flow §4.11). Eigen <main> (buiten het dossier).
//
// ⚠️ DEZE PAGINA STOND ALS ENIGE INHOUDSPAGINA OPEN (reviewzwerm 2.5a, A5).
//
// De redenering was "tier-gating doet het werk". Dat hield niet: de tier1-tak van
// resolveDisclosure negeerde de kijkercontext en gaf onvoorwaardelijk een prijs, terwijl
// de schema-default élk merk op tier1 zet. Een uitgelogde bezoeker met een gedeelde
// deeplink (work-prep en de substitutielijst linken naar /products/<uuid>) zag dus de
// brutoprijs — geen login, geen lead, geen event. Dat is ijzeren regel 1 in zijn kern:
// merken leveren prijslijsten onder de aanname dat die achter Brink's poort blijven.
//
// Beide gaten zijn gedicht, en ze dekken elkaar niet:
//  · hier de poort — de app is in deze fase volledig intern (allowed_emails, 2–5
//    adressen), dus er is geen kijker die hier zónder sessie hoort te komen;
//  · in lib/repo/disclosure.ts de fail-open — óók een ingelogde kijker zonder recht
//    krijgt geen prijs.
//
// De kijker-context (V1): intern = er is een sessie (alle ingelogde gebruikers staan op
// de allowlist en zijn dus intern); hasApprovedProject blijft voorlopig false. Zodra het
// rollenmodel er is (L-03/04) hoort `internal` uit de rol te komen in plaats van uit het
// enkele feit dát er een sessie is — dán wordt de J-03-gate ("Prijs via Brink aanvragen")
// ook weer bereikbaar, voor een specifier zonder project. Zie HANDOVER.md.
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pricerequest?: string }>;
}) {
  const { id } = await params;
  // id gaat als uuid in visible_specs.id / visible_products.id; de guard staat vóór
  // álles, zodat een kapotte link 404 geeft en geen 500.
  requireUuid(id);
  const { pricerequest } = await searchParams;
  const toegang = await bewaakRoute("/products/[id]");
  // 3.2a: `internal` komt nu uit het ORG-TYPE en niet meer uit "er is een sessie". Dat is
  // letterlijk wat het commentaar hierboven aankondigde ("zodra het rollenmodel er is
  // hoort `internal` uit de rol te komen"), en het is de reden dat deze regel niet kon
  // blijven staan: sinds 3.1 kan er een sessie zijn die níet van Brink is, en die zag met
  // `Boolean(session)` onvoorwaardelijk de tier-2-prijs. Nu weer "intern? toon".
  const ctx = {
    internal: toegang.soort === "intern",
    hasApprovedProject: false,
  };

  const result = await getProductForDisclosure(db, id, ctx);
  if (!result) notFound();
  const { spec, disclosure, price, overrides } = result;

  // Prijsvrije objectieve velden voor de vergelijk-tray (respecteert dezelfde zichtbaarheid).
  const compareFields = objectiveFields(spec, disclosure, overrides);
  const canCompare = Object.keys(compareFields).length > 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8 pb-32">
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
