"use client";

import { SegmentErrorScreen } from "../segment-error";

// Foutgrens van /admin en alles eronder (B16) — merkenbeheer, imports, gebruikers.
// Beheerschermen draaien de zwaarste lijsten van de app en zijn precies de plek waar een
// halve datafout normaal is; die hoort de sectie te degraderen, niet de hele app.
// De weg terug is het beheeroverzicht.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentErrorScreen
      section="Admin"
      backHref="/admin"
      backLabel="Back to admin"
      error={error}
      reset={reset}
    />
  );
}
