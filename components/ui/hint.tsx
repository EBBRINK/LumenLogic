import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Tooltip zonder JS, met een vertraging die we zélf bepalen ──────────────────
// Demo Brink Licht 12 aug: "de tooltip komt pas na twee seconden — dan ben ik al aan
// het scrollen om de legenda te zoeken." Dat klopte: de uitleg zat in een `title`,
// en de vertraging daarvan is browser-eigen (~1-2 s) en niet in te stellen. Vandaar
// dit laagje: dezelfde tekst, maar zichtbaar na 300 ms.
//
// Bewust CSS-only (geen Radix, geen client component): de badges die dit gebruiken
// staan in RSC-schermen en de hele app rendert ze server-side. `delay-0` +
// `group-hover/hint:delay-300` betekent 300 ms bij het verschijnen en 0 bij het
// verdwijnen — een uitloop-vertraging voelt als plakkerigheid.
//
// De tekst staat áltijd in de DOM (alleen `opacity-0`), dus schermlezers lezen hem
// ook zonder hover — dat is precies wat een `title` niet betrouwbaar deed. Er staat
// géén `title` meer naast: twee tooltips over elkaar is erger dan één trage.
//
// ⚠ De tooltip klapt naar BENEDEN uit en niet naar boven, want deze badges staan in
// `components/ui/card.tsx` met `overflow-hidden`: alles boven de badge wordt door de
// kaart afgeknipt. `align="end"` verankert rechts, voor badges die tegen de
// rechterrand van hun kaart staan (anders knipt diezelfde kaart de tooltip af).
export function Hint({
  text,
  align = "start",
  className,
  children,
}: {
  text: string;
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("group/hint relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-30 mt-1 w-max max-w-56 rounded-md bg-popover px-2 py-1",
          "text-left text-xs font-normal whitespace-normal text-popover-foreground",
          "ring-1 shadow-md ring-foreground/10",
          "opacity-0 transition-opacity delay-0 duration-100",
          "group-hover/hint:opacity-100 group-hover/hint:delay-300",
          "group-focus-within/hint:opacity-100",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {text}
      </span>
    </span>
  );
}
