import { Badge } from "@/components/ui/badge";
import type { BrandLifecycle } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PriceListExpiryNotice } from "@/components/data/price-list-expiry-notice";
import { priceListIndicator } from "@/lib/repo/brand-relations";

export type BrandListRow = {
  id: string;
  name: string;
  // Optioneel, en dat is opzet: components/admin/admin.test.tsx bouwt deze rijen ook en
  // hoort niet te breken op een veld dat het scherm alleen maar extra toont. Ontbreekt
  // lifecycle, dan geldt de norm ('actief') en verschijnt er dus geen badge.
  brandCode?: string | null;
  lifecycle?: BrandLifecycle;
  // Sprint 1.6 (deel B): voedt de PriceListExpiryNotice-badge. Optioneel om dezelfde
  // reden als brandCode/lifecycle hierboven — bestaande tests die rijen zelf bouwen
  // horen niet te breken op een veld dat het scherm alleen maar extra toont.
  priceListValidUntil?: string | null;
  productCount: number;
};

// De levensfase staat als BADGE in de naamkolom, niet als kolom en niet als tweede select
// (plan §1): de rij draagt al genoeg om op 375px over te lopen. 'actief' is de norm
// en krijgt dus géén badge — alleen de afwijking is nieuws.
const LIFECYCLE_BADGE: Partial<Record<BrandLifecycle, string>> = {
  slapend: "Dormant",
  bestaat_niet_meer: "No longer exists",
};

// MERKENLIJST (sprint 2.0a, blok 3): het add/edit/delete-deel van merkbeheer. De
// disclosure-tier en per-veld-uitzonderingen zijn verhuisd naar
// components/data/brand-visibility-block.tsx op /data/brand-relations/[brandId] — dit
// scherm (uit components/admin/brands-tier-block.tsx) is nu puur de lijst: naam, code,
// levensfase-badge, productaantal, prijslijst-verlopen-notice en de doorklik naar het
// merk-detail (bewerken/verwijderen).
export function BrandsListBlock({ brands }: { brands: BrandListRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Brands</CardTitle>
      </CardHeader>
      <CardContent>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Products</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((b) => {
                // Sprint 1.6 (deel B): dezelfde indicator-logica als het merkrelaties-
                // overzicht, maar hier alleen om te BESLISSEN of de badge verschijnt — de
                // datumlogica zelf woont uitsluitend in priceListIndicator().
                const priceIndicator = priceListIndicator(
                  b.priceListValidUntil ?? null,
                );
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {/* Gewone <a>, geen next/link — precedent brand-relations-table.tsx:
                          de RSC-testbrug struikelt over de client-referentie van Link. */}
                      <a
                        href={`/admin/brands/${b.id}`}
                        className="hover:underline"
                      >
                        {b.name}
                      </a>
                      {LIFECYCLE_BADGE[b.lifecycle ?? "actief"] && (
                        <Badge variant="outline" className="ml-2 align-middle">
                          {LIFECYCLE_BADGE[b.lifecycle ?? "actief"]}
                        </Badge>
                      )}
                      {b.brandCode && (
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {b.brandCode}
                        </span>
                      )}
                      {priceIndicator === "verlopen" && (
                        // whitespace-normal overschrijft TableCell's whitespace-nowrap
                        // (components/ui/table.tsx) — anders knipt de badge zijn eigen
                        // zin af met "…" en verdwijnt de einddatum uit beeld.
                        <div className="mt-1 whitespace-normal">
                          <PriceListExpiryNotice
                            indicator={priceIndicator}
                            validUntil={b.priceListValidUntil ?? null}
                            variant="badge"
                            brandName={b.name}
                            href={`/data/brand-relations/${b.id}`}
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.productCount}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
