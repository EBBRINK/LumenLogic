"use client";
// Test-only client-wrappers voor de PDF-upload-interactietests. De vitest-RSC-brug
// levert de return-waarde van een imperatief aangeroepen server-action niet terug
// (het {error}-object komt als undefined aan — vermoedelijk een harness-beperking;
// in echte Next werkt het return-pad wél). Daarom stubben we de action hier
// client-side: de kaartlogica (extractie, busy, {error} → alert) is dan volledig
// en eerlijk te testen; alleen de draad door de echte action-brug blijft buiten schot.
import { PdfUploadCard } from "./pdf-upload-card";

export function KaartMetErrorAction() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => ({ error: "Testfout: import geweigerd." })}
    />
  );
}

export function KaartMetTrageErrorAction() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => {
        await new Promise((r) => setTimeout(r, 800));
        return { error: "Testfout: trage import geweigerd." };
      }}
    />
  );
}
