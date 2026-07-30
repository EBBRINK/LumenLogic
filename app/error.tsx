"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Foutgrens van de hele app (UX-audit 30 jul, bug #1). "use client" is geen keuze:
// Next eist het voor elke error boundary — het component moet aan een
// componentDidCatch hangen en `reset` is een client-callback.
//
// De foutmelding en de stack gaan hier BEWUST niet in beeld. Ze zeggen de gebruiker
// niets ("invalid input syntax for type uuid") en kunnen tabel- en kolomnamen
// prijsgeven. Wat wél mee mag is de digest: dat is Next' eigen hash van de fout,
// geen inhoud, en het is het enige waarmee een melding aan een serverlog te
// koppelen is. Zelfde vorm als not-found.tsx, zodat de twee als één paar lezen.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // BEWUSTE UITZONDERING op de 1280px-paginacontainer (DESIGN.md §5). Dit is geen
    // inhoudspagina met een linkerrand die met de navbalk moet uitlijnen, maar een
    // gecentreerde doodlopende staat: één kop, één zin, twee knoppen, alles
    // `text-center` in een gecentreerde kaart. Op 1280px wordt dat een lege bak van
    // ruim een meter met een zinnetje in het midden. Vastgelegd in de allowlist van
    // components/container-breedte.test.ts — niet stilzwijgend naar max-w-7xl trekken.
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16">
      <div className="w-full rounded-lg border border-dashed p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          This screen could not be loaded. Nothing was changed — you can try
          again, and if it keeps failing the error is in the server log.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          {/* variant="secondary" (neutraal vlak) en NIET "outline": die zet
              brand-blue #2D5A8C als tekst op de donkere achtergrond #0F1626 en dat
              is 2,5:1 — nagerekend, ruim onder de 4,5:1 van kit §11. Op precies dít
              scherm is de weg terug het enige dat werkt, dus die moet in beide
              standen leesbaar zijn. Zie ook DESIGN.md O10/O13. */}
          <Button asChild variant="secondary">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground tabular-nums">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
