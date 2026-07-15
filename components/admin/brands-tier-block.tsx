import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// De per-veld-uitzonderingen die de admin per merk kan sturen (J-04). Bewust een korte,
// vaste set — de velden die commercieel/gevoelig zijn. Geen vrije-tekst-veldnaam: dat zou
// stille typefouten uitnodigen.
const TOGGLE_FIELDS = [
  { field: "gross_price", label: "Price" },
  { field: "max_wattage", label: "Power" },
  { field: "kelvin", label: "Kelvin" },
  { field: "cri", label: "CRI" },
] as const;

export type BrandTierRow = {
  id: string;
  name: string;
  disclosureTier: "tier1" | "tier2" | "tier3";
  productCount: number;
  // per-veld-override: field → visible. Ontbreekt een veld, dan geldt de tier-basis.
  overrides: Record<string, boolean>;
};

const TIER_LABEL: Record<BrandTierRow["disclosureTier"], string> = {
  tier1: "Tier 1 · everything + price",
  tier2: "Tier 2 · specs, price gated",
  tier3: "Tier 3 · name only",
};

// MERKEN & TIERS (§3.16, J-02/J-04): per merk de disclosure-tier en de per-veld-
// uitzonderingen. De tier stuurt wat een externe kijker ziet — nooit de ranking (geld
// staat buiten elke sortering). Een merk zonder producten (net ingeladen) staat er ook,
// met nul: het gat blijft eerlijk zichtbaar.
export function BrandsTierBlock({
  brands,
  setTierAction,
  setFieldVisibilityAction,
}: {
  brands: BrandTierRow[];
  setTierAction: (formData: FormData) => void | Promise<void>;
  setFieldVisibilityAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Brands &amp; visibility</CardTitle>
        <p className="text-sm text-muted-foreground">
          The disclosure tier per brand controls what an external viewer sees —
          never the ranking. You can override the tier baseline per field.
        </p>
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
                <TableHead>Tier</TableHead>
                <TableHead>Field exceptions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.productCount}
                  </TableCell>
                  <TableCell>
                    <form
                      action={setTierAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="brandId" value={b.id} />
                      <select
                        name="tier"
                        defaultValue={b.disclosureTier}
                        aria-label={`Tier for ${b.name}`}
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      >
                        {(["tier1", "tier2", "tier3"] as const).map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="outline">
                        Set
                      </Button>
                    </form>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {TOGGLE_FIELDS.map(({ field, label }) => {
                        const override = b.overrides[field];
                        const state =
                          override === undefined
                            ? "base"
                            : override
                              ? "visible"
                              : "hidden";
                        // De actie schakelt naar het tegenovergestelde van de
                        // huidige effectieve keuze; 'basis' → expliciet verbergen.
                        const nextVisible = override === true ? "false" : "true";
                        return (
                          <form
                            key={field}
                            action={setFieldVisibilityAction}
                            className="inline-flex"
                          >
                            <input type="hidden" name="brandId" value={b.id} />
                            <input type="hidden" name="field" value={field} />
                            <input
                              type="hidden"
                              name="visible"
                              value={nextVisible}
                            />
                            <button
                              type="submit"
                              title={`${label}: ${state} — click to toggle`}
                              className="inline-flex"
                            >
                              <Badge
                                variant={
                                  override === false
                                    ? "destructive"
                                    : override === true
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {label}: {state}
                              </Badge>
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
