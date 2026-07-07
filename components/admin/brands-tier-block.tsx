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
  { field: "gross_price", label: "Prijs" },
  { field: "max_wattage", label: "Vermogen" },
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
  tier1: "Tier 1 · alles + prijs",
  tier2: "Tier 2 · specs, prijs gated",
  tier3: "Tier 3 · alleen naam",
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
        <CardTitle>Merken &amp; zichtbaarheid</CardTitle>
        <p className="text-sm text-muted-foreground">
          De disclosure-tier per merk stuurt wat een externe kijker ziet — nooit
          de ranking. Per veld kun je de tier-basis overschrijven.
        </p>
      </CardHeader>
      <CardContent>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen merken.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merk</TableHead>
                <TableHead className="text-right">Producten</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Veld-uitzonderingen</TableHead>
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
                        aria-label={`Tier voor ${b.name}`}
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      >
                        {(["tier1", "tier2", "tier3"] as const).map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="outline">
                        Zet
                      </Button>
                    </form>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {TOGGLE_FIELDS.map(({ field, label }) => {
                        const override = b.overrides[field];
                        const state =
                          override === undefined
                            ? "basis"
                            : override
                              ? "zichtbaar"
                              : "verborgen";
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
                              title={`${label}: ${state} — klik om te wisselen`}
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
