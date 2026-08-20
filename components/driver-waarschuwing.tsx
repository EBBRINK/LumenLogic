// "Controleer of hier een driver of accessoire bij hoort." — de herinnering, niet de koppeling.
//
// Besloten in de demo van 12 aug 2026: Brink verkocht een project en vergat de plastic kits.
// Bij navraag zegt het merk zelf wat er nog bij moet. Wat dit component NIET doet: raden
// wélke driver. Dat kan ook niet — een driver kies je niet op wattage, er zijn verschillende
// types. Het signaal komt uit lib/repo/onderdeel-merken.ts en zegt alleen: dit merk voert
// losse onderdelen.
//
// ⚠️ TERUGHOUDENDHEID IS EEN EIS, GEEN SMAAK. Een waarschuwing die bij elke regel van een
// veertigregelige offerte verschijnt leert iedereen hem wegkijken, en dan is hij erger dan
// niets — precies de faalmodus die de klant beschreef. Vandaar twee vormen, en dat is de
// hele reden dat dit component een `variant` heeft:
//   `regel`   — één armatuur in beeld (regel-detail). Inline bij de regel.
//   `overzicht` — veel regels in beeld (offerte). EÉN melding, met de merken erin genoemd.
// Zet `regel` dus nooit in een lijst met meer dan één armatuur.
//
// Server-component, geen client-JS, geen lucide-react — precedent price-list-expiry-notice.
import { cn } from "@/lib/utils";

/** De ene zin, zodat regel- en overzichtsvorm nooit iets anders beweren. */
function zin(merken: readonly string[]): string {
  const lijst =
    merken.length === 0
      ? "This brand"
      : merken.length === 1
        ? merken[0]
        : `${merken.slice(0, -1).join(", ")} and ${merken[merken.length - 1]}`;
  const werkwoord = merken.length > 1 ? "sell" : "sells";
  return `${lijst} ${werkwoord} drivers and accessories as separate items — check whether one is needed here.`;
}

export function DriverWaarschuwing({
  merken,
  variant,
  className,
}: {
  /** De merknamen waarvoor het signaal aanstaat. Leeg → niets. */
  merken: readonly string[];
  variant: "regel" | "overzicht";
  className?: string;
}) {
  // Leeg rendert niets, zodat een scherm de component onvoorwaardelijk kan plaatsen.
  if (merken.length === 0) return null;

  return (
    <p
      role="note"
      className={cn(
        "rounded-md bg-status-amber-tint px-2 py-1 text-xs text-status-amber-ink",
        variant === "overzicht" && "px-3 py-2 text-sm",
        className,
      )}
    >
      {zin(merken)}
    </p>
  );
}
