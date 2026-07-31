"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Het gedeelde scherm achter de SEGMENT-foutgrenzen (reviewzwerm 2.5a, B16).
//
// Tot deze fix had de hele app-boom exact drie fallbacks — app/error.tsx,
// app/global-error.tsx, app/not-found.tsx — en geen enkele op een segment. Gevolg: één
// kapotte query in één sectie haalde de HELE pagina naar het wortelfoutscherm, buiten de
// navigatie om. Een segment-error.tsx hangt ónder app/layout.tsx: de navbalk blijft staan
// en alleen de inhoud van die sectie wordt vervangen. Dat is het hele verschil, en het is
// ook de reden dat de kop hier de sectie NOEMT: "Projects could not be loaded" zegt wat er
// stuk is, waar "Something went wrong" (de wortel) alleen zegt dát er iets stuk is.
//
// Geen eigen vormtaal: zelfde kaart, zelfde twee uitwegen, zelfde digest-regel als
// app/error.tsx. De foutmelding en de stack gaan hier net zo goed NIET in beeld — ze
// zeggen de gebruiker niets en kunnen tabel- en kolomnamen prijsgeven. Alleen de digest
// mag mee: Next' eigen hash, geen inhoud, het enige haakje naar het serverlog.
//
// "use client" is geen keuze: Next eist het voor elke error boundary (het component moet
// aan een componentDidCatch hangen en `reset` is een client-callback).
export function SegmentErrorScreen({
  section,
  backHref,
  backLabel,
  error,
  reset,
}: {
  /** Sectienaam zoals in de hoofdbalk ("Projects", "Data", "Admin"). */
  section: string;
  backHref: string;
  backLabel: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // Zelfde BEWUSTE UITZONDERING op de 1280px-paginacontainer als app/error.tsx
    // (DESIGN.md §5): een doodlopende staat is gecentreerd, niet linksuitgelijnd. Staat
    // in de allowlist van components/container-breedte.test.ts.
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16">
      <div className="w-full rounded-lg border border-dashed p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {section} could not be loaded
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Something in this section failed. Nothing was changed, and the rest of
          the app still works — use the menu above, or try again. If it keeps
          failing the error is in the server log.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          {/* variant="secondary", niet "outline" — outline zet brand-blue #2D5A8C als
              tekst op #0F1626 (2,5:1, onder de 4,5:1 van kit §11). Zie app/error.tsx. */}
          <Button asChild variant="secondary">
            <Link href={backHref}>{backLabel}</Link>
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
