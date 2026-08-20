import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { veldClass } from "@/components/ui/field";

// De per-veld-uitzonderingen die de admin per merk kan sturen (J-04). Bewust een korte,
// vaste set — de velden die commercieel/gevoelig zijn. Geen vrije-tekst-veldnaam: dat zou
// stille typefouten uitnodigen.
//
// Verhuisd uit components/admin/brands-tier-block.tsx (blok 3, sprint 2.0a): dit is de
// éénmerks-variant, hier op /brand-management/[brandId] — zichtbaarheid is geen
// merkbeheer, en leeft nu bij de merkrelatie in plaats van in Admin.
const TOGGLE_FIELDS = [
  { field: "gross_price", label: "Price" },
  { field: "max_wattage", label: "Power" },
  { field: "kelvin", label: "Kelvin" },
  { field: "cri", label: "CRI" },
] as const;

const TIER_LABEL: Record<"tier1" | "tier2" | "tier3", string> = {
  tier1: "Tier 1 · everything + price",
  tier2: "Tier 2 · specs, price gated",
  tier3: "Tier 3 · name only",
};

// ZICHTBAARHEID (§3.16, J-02/J-04) voor één merk: de disclosure-tier en de per-veld-
// uitzonderingen. De tier stuurt wat een externe kijker ziet — nooit de ranking (geld
// staat buiten elke sortering).
export function BrandVisibilityBlock({
  brandId,
  disclosureTier,
  overrides,
  setTierAction,
  setFieldVisibilityAction,
}: {
  brandId: string;
  disclosureTier: "tier1" | "tier2" | "tier3";
  // per-veld-override: field → visible. Ontbreekt een veld, dan geldt de tier-basis.
  overrides: Record<string, boolean>;
  setTierAction: (formData: FormData) => void | Promise<void>;
  setFieldVisibilityAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visibility (disclosure)</CardTitle>
        <p className="text-sm text-muted-foreground">
          The disclosure tier controls what an external viewer sees — never
          the ranking. You can override the tier baseline per field.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          action={setTierAction}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="brandId" value={brandId} />
          <select
            name="tier"
            defaultValue={disclosureTier}
            aria-label="Disclosure tier"
            className={veldClass}
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
        <div className="flex flex-wrap gap-1.5">
          {TOGGLE_FIELDS.map(({ field, label }) => {
            const override = overrides[field];
            const state =
              override === undefined ? "base" : override ? "visible" : "hidden";
            // De actie schakelt naar het tegenovergestelde van de huidige effectieve
            // keuze; 'basis' → expliciet verbergen.
            const nextVisible = override === true ? "false" : "true";
            return (
              <form
                key={field}
                action={setFieldVisibilityAction}
                className="inline-flex"
              >
                <input type="hidden" name="brandId" value={brandId} />
                <input type="hidden" name="field" value={field} />
                <input type="hidden" name="visible" value={nextVisible} />
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
      </CardContent>
    </Card>
  );
}
