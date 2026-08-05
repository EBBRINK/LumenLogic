"use client";

import { SegmentErrorScreen } from "../segment-error";

// Foutgrens van /projects en alles eronder (B16). Vangt de dossierlijst, de dossierpagina,
// de importschermen en het reviewstation — zonder deze grens sleepte één kapotte spec-regel
// de hele pagina naar het wortelfoutscherm, buiten de navigatie om.
// De weg terug is de dossierlijst: faalt een dossierpagina, dan is dat het scherm waar de
// gebruiker heen wil. Faalt de lijst zelf, dan blijven "Try again" én de navbalk over.
export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentErrorScreen
      section="Projects"
      backHref="/projects"
      backLabel="Back to projects"
      error={error}
      reset={reset}
    />
  );
}
