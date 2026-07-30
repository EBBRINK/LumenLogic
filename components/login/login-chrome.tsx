// Gedeelde omlijsting van /login: kop, wachtwoordformulier (children) en de
// magic-link-onthulling. Staat hier in components/ — en NIET (ook niet gedeeltelijk)
// gekopieerd in app/login/page.tsx of login.test.tsx — zodat de test exact hetzelfde
// bestand rendert als de app. Golf-2-critic ronde 1: een handkopie in de testfile liep al
// binnen één ronde uit de pas (de test miste de focus-ring-klassen van de echte summary).
//
// G27/G32: wachtwoord is het hoofdpad, de magic link staat ernaast als secundair pad —
// zie docs/sprint3-1-briefing.md §5 punt 6 en de correctie in G35. De onthulling is de
// ENIGE weg terug naar de magic link na deploy 1, dus dit is geen decoratief detail: het
// moet een echt, ≥44px bedieningselement zijn (DESIGN.md §6/§7), niet een streepje tekst.
//
// Kaart-styling (ring-1 ring-foreground/10 bg-card) i.p.v. een input-achtige
// border-klasse: anders leest het vak als een vierde, uitgegrijsde invoervorm naast de
// echte velden erboven (exact de klacht van de critic). Padding staat op de <summary>
// zelf (px-4 py-3, zelfde als het precedent in components/data/custom-fields-table.tsx:89),
// niet op <details> — dat gaf eerder een klikbare zone van 20px met 11px dode ruimte
// erboven/eronder.
//
// text-brand-blue is in dark maar 2,54:1 (geen .dark-override voor --brand-blue in
// app/globals.css — projectbrede zwakte, hier niet gerepareerd) — dark:text-brand-teal
// trekt dit recht tot 5,47:1 tegen bg-card, exact de kit-route die O10/O12 al voor andere
// elementen op donker kiezen (blauw → teal). De focus-ring gebruikt om diezelfde reden geen
// focus-visible:border-ring (de summary heeft geen rand, dus dat was een no-op) maar een
// losstaande ring mét offset, zoals §7 voorschrijft.
import { MagicLinkForm } from "./magic-link-form";

export function LoginChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lumen Logic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spec, calculation and quotation tool — Brink Licht.
        </p>
      </div>

      {children}

      <details className="group rounded-lg bg-card ring-1 ring-foreground/10">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-medium text-brand-blue outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-brand-teal">
          Use a magic link instead
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-180"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="px-4 pb-4">
          <MagicLinkForm />
        </div>
      </details>
    </main>
  );
}
