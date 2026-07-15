"use client";
// Stap 5 (plan-aanvraag-estimate): de PDF-upload is de hoofdingang van een project en
// staat als éérste blok boven de regeltabel.
//
// 413-fix: dit is een CLIENT component — de PDF wordt in de browser gelezen (unpdf,
// dynamisch geladen bij submit) en alleen de tekstlaag per pagina gaat als JSON naar de
// server-action. Een 5,5+ MB armaturenboek blijft zo ruim onder Next's 1 MB action-
// bodylimiet en Vercel's harde ~4,5 MB request-limiet. Faalt de browser-extractie
// (beschadigde PDF), dan is dat hier al bekend en tonen we een eerlijke melding —
// er is bewust géén stille binaire fallback-upload meer.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconUpload } from "./icons";

// Client-side groottegrens: boven 100 MB laden we het bestand niet eens in het
// geheugen (file.arrayBuffer() kan de tab dan laten vastlopen). Gewone grote
// armaturenboeken (5–50 MB, veel foto's) blijven gewoon werken.
const MAX_CLIENT_PDF_BYTES = 100 * 1024 * 1024;

export type PdfPagesImportAction = (input: {
  dossierId: string;
  filename: string;
  pages: string[];
}) => Promise<{ error: string } | void>;

export function PdfUploadCard({
  dossierId,
  importAction,
}: {
  dossierId: string;
  importAction: PdfPagesImportAction;
}) {
  // busy = voortgangstekst tijdens lezen/importeren; error = eerlijke foutmelding.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = new FormData(e.currentTarget).get("pdf");
    if (!(file instanceof File) || file.size === 0) return;
    if (file.size > MAX_CLIENT_PDF_BYTES) {
      setError(
        `This file is very large (${Math.round(file.size / 1024 / 1024)} MB) — the browser may freeze while reading it. Reduce the PDF to under 100 MB and try again.`,
      );
      return;
    }
    setBusy("Reading PDF…");
    try {
      let pages: string[];
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { extractPagesFromPdf } = await import("@/lib/pdf/extract");
        pages = await extractPagesFromPdf(bytes);
      } catch {
        setError(
          "This PDF could not be read (corrupted or not a valid PDF) — nothing was imported.",
        );
        return;
      }
      // Ook zonder tekstlaag sturen we de (lege) pagina's door: de server legt dan
      // een importrun + event vast en toont dezelfde eerlijke geen-tekstlaag-melding.
      setBusy(`PDF read — ${pages.length} pages, importing…`);
      const result = await importAction({
        dossierId,
        filename: file.name,
        pages,
      });
      if (result && "error" in result) setError(result.error);
      // bij succes redirect de action zelf; deze component verdwijnt dan.
    } catch {
      setError("Import failed — please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconUpload aria-hidden /> Upload luminaire schedule (PDF)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Upload the luminaire schedule — lines are matched automatically. Only
          PDFs with a text layer; the source text is kept with the import as an
          audit trail.
        </p>
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="pdf"
            accept="application/pdf"
            required
            disabled={busy != null}
            aria-label="Choose luminaire schedule PDF"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
          />
          <Button type="submit" disabled={busy != null}>
            {busy ?? "Import PDF"}
          </Button>
        </form>
        {busy && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {busy}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
