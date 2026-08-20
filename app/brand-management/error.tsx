"use client";

import { SegmentErrorScreen } from "../segment-error";

// Foutgrens van /brand-management en alles eronder (B16) — het merkenoverzicht, de
// merkdetailpagina met upload- en templateflow, en de prijslijsten. Dit is het zwaarste
// segment van de app: het overzicht scant ~210k rijen en die schermen stapelen meerdere
// blokken op één pagina. Zonder deze grens haalde één kapot blok het hele scherm
// (inclusief navigatie) naar de wortelfallback.
//
// Stond tot 12 aug op app/data/error.tsx: dezelfde grens, maar toen nog boven de
// Data-werkbank. De beheerschermen die daar ook onder vielen (fields, event log, loading,
// evaluation) staan sinds de IA-opschoning onder /admin en erven app/admin/error.tsx.
export default function BrandManagementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentErrorScreen
      section="Brand management"
      backHref="/brand-management"
      backLabel="Back to brand management"
      error={error}
      reset={reset}
    />
  );
}
