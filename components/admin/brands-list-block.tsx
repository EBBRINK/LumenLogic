import type { BrandLifecycle } from "@/db/schema";
import { BrandLifecycleBadge } from "@/components/admin/brand-lifecycle-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
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

// De levensfase staat als BADGE in de naamkolom (plan §1). De labels en de badge zelf staan
// sinds de UX-audit van 30 jul in components/admin/brand-lifecycle-badge.tsx, omdat
// /data/price-lists dezelfde badge toont — één presentatie, geen tweede kopie.

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
          // Was een kale grijze regel — het dialect dat empty-state.tsx afschaft
          // (UX-audit 30 jul, A6).
          //
          // "inline": deze tak staat ín de <CardContent> hierboven, dus de kaart
          // tekent het vlak al. "framed" zou hier een gestreept kader bínnen een
          // kaart zetten — precies de fout die de variant-keuze moet voorkomen.
          //
          // Bewuste `action={null}`: nagekeken, niet aangenomen — "New brand" bestaat
          // wél (app/admin/brands/page.tsx wijst naar /admin/brands/new), maar staat
          // als primary in de PAGINAKOP, één blok hoger. Een tweede knop hier zet
          // dezelfde route twee keer in beeld en breekt de knophierarchie van dit
          // scherm; de uitleg wijst er in woorden naar. Zelfde afweging als
          // dossier-list.tsx en allowed-emails-block.tsx.
          //
          // Schrijf hier géén letterlijke knop-tag in het commentaar: de scan in
          // components/knophierarchie.test.tsx leest ruwe broncode met /<Button\b/ en
          // strípt geen commentaar, dus een genoemde tag telt mee als tweede primary
          // van dit scherm. Eén keer op gestruikeld tijdens deze omzetting.
          <EmptyState
            variant="inline"
            title="No brands yet."
            description="Brands come in with the price list import, or you add one by hand with “New brand” above."
            action={null}
          />
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
                      <BrandLifecycleBadge
                        lifecycle={b.lifecycle}
                        className="ml-2"
                      />
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
                            // Wees naar de merkpagina, maar dáár staat alleen dezelfde
                            // melding — een doodlopende doorverwijzing. De verlenging
                            // gebeurt op /data/price-lists (bevinding B3).
                            href="/data/price-lists"
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
