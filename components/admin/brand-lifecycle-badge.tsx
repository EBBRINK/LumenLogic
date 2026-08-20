// Levensfase-badge van een merk — één presentatie, hergebruikt op elk scherm dat een merk
// als rij toont. Stond als losse map in brands-list-block.tsx; sinds /brand-management/price-lists
// dezelfde badge nodig heeft (UX-audit 30 jul: een merk dat niet meer bestaat kreeg daar
// een schone groene rij) woont hij hier, zodat er nooit twee presentaties naast elkaar
// ontstaan die uit elkaar kunnen lopen — zelfde afweging als PriceListExpiryNotice
// (sprint 1.6, deel B, besluit G8).
//
// De fase is een BADGE, geen kolom en geen tweede select (sprint 1.5, plan §1): de rij
// draagt al genoeg om op 375px over te lopen. 'actief' is de norm en krijgt dus géén badge —
// alleen de afwijking is nieuws.
//
// Geen eigen kleur: `variant="outline"` is neutraal. Dat is opzet — de statuskleuren van dit
// project horen bij de matcher-standen en de prijslijst-geldigheid (besluit O13), niet bij
// de levensfase van een merk.
import { Badge } from "@/components/ui/badge";
import type { BrandLifecycle } from "@/db/schema";
import { cn } from "@/lib/utils";

export const LIFECYCLE_BADGE: Partial<Record<BrandLifecycle, string>> = {
  slapend: "Dormant",
  bestaat_niet_meer: "No longer exists",
};

/**
 * Rendert niets voor 'actief' (en voor een ontbrekende fase, die als 'actief' geldt) —
 * callers hoeven dus zelf niet te beslissen of de badge verschijnt.
 */
export function BrandLifecycleBadge({
  lifecycle,
  className,
}: {
  lifecycle?: BrandLifecycle | null;
  className?: string;
}) {
  const label = LIFECYCLE_BADGE[lifecycle ?? "actief"];
  if (!label) return null;
  return (
    <Badge variant="outline" className={cn(className, "align-middle")}>
      {label}
    </Badge>
  );
}
