import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ÉÉN lege toestand voor de hele app (UX-audit 30 jul, A6).
//
// De audit vond vijf verschillende dialecten voor "hier staat niets", over ~twaalf
// plekken, zonder gedeeld component. Leegte is de staat die een nieuwe gebruiker het
// vaakst ziet; vijf dialecten laten het als vijf producten lezen. Dit component is de
// promotie van dialect 1 (gecentreerd in een gestreept kader, titel + gemaximeerde
// uitleg) tot de enige toegestane vorm.
//
// De API is zo smal gehouden dat een zesde variant lastig te schrijven is:
//
//   • GEEN `className`. Wie afstand of breedte nodig heeft, wikkelt eromheen — de
//     binnenkant is niet van de aanroeper. Dit is de belangrijkste rem: elke vorige
//     dialect ontstond doordat de aanroeper zijn eigen kader mocht tekenen.
//   • `variant` is een gesloten unie van precies twee waarden, en die twee bestaan om
//     één echte reden: WIE tekent het vlak.
//       - "framed"  (default) — het component tekent zelf een gestreept kader op het
//         kale canvas. Dit is dialect 1.
//       - "inline"  — de aanroeper zit al ín een <Card>/paneel. Een kader binnen een
//         kader is de fout die dialect 4 probeerde te vermijden door dan maar een kale
//         grijze regel neer te zetten; "inline" geeft die plek dezelfde titel/uitleg/
//         actie-structuur zónder tweede rand.
//   • `action` is VERPLICHT, ook als er geen actie is. Dan schrijf je `action={null}`.
//     Een lege toestand zonder uitweg is soms terecht (een alleen-lezen logboek, een
//     alleen-lezen adminlijst) maar mag nooit per ongeluk ontstaan: de audit's klacht
//     bij dialect 2 en 4 was juist "de actie mist altijd". TypeScript dwingt hier dus
//     een keuze af, en `action={null}` is greppable bewijs dat die keuze bewust was.
//
// Kleur: de uitleg gebruikt `text-muted-foreground` (#8E9BA8). Dat is 2,8:1 en een
// vastgelegde, bewuste afwijking — DESIGN.md §11-O8. Niet "opruimen".

type EmptyStateProps = {
  /** Wat er niet is, in één zin. Staat op voorgrondkleur, medium gewicht. */
  title: string;
  /**
   * Waarom het leeg is en/of wat de volgende stap is. Mag meerdere <p>'s bevatten;
   * die krijgen onderling automatisch ruimte.
   */
  description?: ReactNode;
  /**
   * De uitweg — meestal een <form action={…}> met één knop, of een <Link>.
   * VERPLICHT: geef expliciet `null` door als deze lege toestand er geen heeft.
   */
  action: ReactNode | null;
  /** "framed" = eigen gestreept kader op canvas · "inline" = binnen een bestaande kaart. */
  variant?: "framed" | "inline";
};

export function EmptyState({
  title,
  description,
  action,
  variant = "framed",
}: EmptyStateProps) {
  const framed = variant === "framed";
  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn(
        framed && "rounded-xl border border-dashed p-8 text-center",
      )}
    >
      <p className={cn("font-medium", !framed && "text-sm")}>{title}</p>
      {description != null && (
        <div
          className={cn(
            "mt-1 text-sm text-muted-foreground [&>p+p]:mt-2",
            framed && "mx-auto max-w-md",
          )}
        >
          {description}
        </div>
      )}
      {action != null && (
        <div
          className={cn(
            "mt-4 flex flex-wrap gap-2",
            framed && "justify-center",
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
