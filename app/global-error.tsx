"use client";

import "./globals.css";
import { Button } from "@/components/ui/button";

// Laatste vangnet: de foutgrens die app/layout.tsx zélf dekt (UX-audit 30 jul, bug #1,
// reparatiepas). app/error.tsx hangt ONDER de root-layout en kan die layout dus niet
// vangen — klapt de layout, of klapt error.tsx zelf, dan gaf Next zijn eigen kale
// ongestileerde 500-pagina. Precies het symptoom waar bug #1 over gaat, alleen één
// niveau hoger.
//
// Dat is geen theoretisch pad: app/layout.tsx haalt `next/font/google` óver het netwerk
// op (Geist + Geist_Mono). Valt die fetch om, dan is er zonder dit bestand geen enkel
// scherm meer in de huisstijl.
//
// global-error VERVANGT de root-layout, dus het rendert zijn eigen <html>/<body> — Next
// eist dat — en importeert globals.css zelf, want de import in de layout is nu juist wat
// niet gedraaid heeft. Bewust GEEN next/font: dat is de meest waarschijnlijke oorzaak van
// de fout die we hier opvangen. De systeemletter is hier goed genoeg.
//
// Zelfde lekdichtheid als error.tsx: alleen de digest, nooit de melding en nooit de
// stack. Die tonen de gebruiker niets ("invalid input syntax for type uuid") en kunnen
// tabel- en kolomnamen prijsgeven.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16">
          <div className="w-full rounded-lg border border-dashed p-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Something went wrong
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              The application could not be loaded. Nothing was changed — you can
              try again, and if it keeps failing the error is in the server log.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={reset}>Try again</Button>
              {/* variant="secondary" en niet "outline", om dezelfde contrastreden als in
                  error.tsx (brand-blue als tekst op de donkere achtergrond haalt de
                  4,5:1 van kit §11 niet). En een kale <a> in plaats van next/link: op
                  dit scherm is de root-layout stuk, dus er is geen shell om naartoe te
                  soft-navigeren — alleen een harde navigatie levert een schone pagina. */}
              <Button asChild variant="secondary">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- zie
                    hierboven: bewuste harde navigatie, geen vergeten <Link>. */}
                <a href="/projects">Back to projects</a>
              </Button>
            </div>
            {error.digest && (
              <p className="mt-6 text-xs text-muted-foreground tabular-nums">
                Reference: {error.digest}
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
