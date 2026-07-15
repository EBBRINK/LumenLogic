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
    setBusy("PDF lezen…");
    try {
      let pages: string[];
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { extractPagesFromPdf } = await import("@/lib/pdf/extract");
        pages = await extractPagesFromPdf(bytes);
      } catch {
        setError(
          "Deze PDF kon niet gelezen worden (beschadigd of geen geldige PDF) — er is niets geïmporteerd.",
        );
        return;
      }
      // Ook zonder tekstlaag sturen we de (lege) pagina's door: de server legt dan
      // een importrun + event vast en toont dezelfde eerlijke geen-tekstlaag-melding.
      setBusy(`PDF gelezen — ${pages.length} pagina's, importeren…`);
      const result = await importAction({
        dossierId,
        filename: file.name,
        pages,
      });
      if (result && "error" in result) setError(result.error);
      // bij succes redirect de action zelf; deze component verdwijnt dan.
    } catch {
      setError("Importeren mislukt — probeer het opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconUpload aria-hidden /> Armaturenboek uploaden (PDF)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Upload het armaturenboek — regels worden automatisch gematcht. Alleen
          PDF&apos;s met tekstlaag; de brontekst blijft als controlespoor bij de
          import bewaard.
        </p>
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="pdf"
            accept="application/pdf"
            required
            disabled={busy != null}
            aria-label="Armaturenboek-PDF kiezen"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
          />
          <Button type="submit" disabled={busy != null}>
            {busy ?? "Importeer PDF"}
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
