"use client";
// Test-only client-wrapper voor de upload-kaart, exact het precedent van
// components/dossier/pdf-upload-test-stubs.tsx: de vitest-RSC-brug levert de
// RETURN-waarde van een imperatief aangeroepen server-action niet terug (die komt als
// undefined aan; in echte Next werkt het return-pad wél). De kaart toont een
// format-afwijzing juist uit die return-waarde, dus stubben we de action hier
// client-side. Wat daarmee getest wordt is de kaartlogica (bestand → afwijzing → alert);
// alleen de draad door de echte action-brug blijft buiten schot.
//
// REDEN EN TEKST KOMEN ALS PROP BINNEN, ze worden hier niet berekend. Dat is geen
// omweg maar de enige werkende vorm, en hij spiegelt productie:
//   1. Een export uit een "use client"-module is aan de serverkant een client-REFERENTIE,
//      geen waarde. Een `export const AFWIJZINGS_TEKST` hieruit importeren in de test
//      (die serverside rendert) levert letterlijk "Unexpectedly client reference export
//      is called on server" op — precies waarvoor template-upload-limits.ts waarschuwt.
//   2. afwijzingsTekst() hoort sowieso aan de serverkant: excel-validate-messages trekt
//      exceljs mee (zie de kop van template-upload-card.tsx). De test rendert de zin dus
//      serverside en geeft hem door, net als de echte action doet.
import type { AfwijzingsReden } from "@/lib/excel-validate";
import { TemplateUploadCard } from "./template-upload-card";

export function KaartMetFormatAfwijzing({
  reden,
  tekst,
}: {
  reden: AfwijzingsReden;
  tekst: string;
}) {
  return (
    <TemplateUploadCard
      brandId="b-occhio"
      uploadAction={async () => ({ status: "rejected", reden, tekst })}
    />
  );
}
