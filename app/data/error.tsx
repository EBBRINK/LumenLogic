"use client";

import { SegmentErrorScreen } from "../segment-error";

// Foutgrens van /data en alles eronder (B16) — merkrelaties, prijslijsten, verrijking,
// eigen velden, het eventlog. Dit is het zwaarste segment van de app: /data/brand-relations
// scant ~210k rijen, en die schermen stapelen meerdere blokken op één pagina. Zonder deze
// grens haalde één kapot blok het hele scherm (inclusief navigatie) naar de wortelfallback.
// De weg terug is het data-overzicht.
export default function DataError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentErrorScreen
      section="Data"
      backHref="/data"
      backLabel="Back to data"
      error={error}
      reset={reset}
    />
  );
}
