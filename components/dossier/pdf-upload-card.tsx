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
//
// OCR (plan-ocr-beeld-pdf, bouwstap 5): heeft de PDF 0 tekens tekstlaag (beeld-PDF),
// dan gaat hij NIET meer als lege import naar de server, maar door de OCR-loop:
// startOcrAction → per pagina renderen (lib/pdf/render, één hergebruikt canvas,
// strikt sequentieel — B1) → FormData → ocrPageAction → finishOcrAction (die
// redirect zelf, net als de gewone import). Hervatten (B5): een run die 'bezig'
// bleef staan komt als pendingOcr binnen; zelfde bestand kiezen = verder waar hij
// bleef (donePages worden overgeslagen).
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

// Signatures spiegelen exact de server-actions in app/projects/actions.ts.
export type StartOcrAction = (input: {
  dossierId: string;
  filename: string;
  pageCount: number;
}) => Promise<
  | { error: string }
  | { runId: string; resumed: boolean; donePages: number[] }
>;

export type OcrPageAction = (formData: FormData) => Promise<
  | { error: string }
  | { alreadyDone: true }
  | { stopped: "budget" | "no_key" }
  | { failed: string }
  | { created: number; duplicates: number }
>;

export type FinishOcrAction = (
  formData: FormData,
) => Promise<{ error: string } | void>;

// Openstaande OCR-run van dit dossier (B5) — de projectpagina haalt dit bytes-vrij
// op (getOpenOcrRun) zodat de kaart bij een paginabezoek een hervat-knop toont.
export interface PendingOcrRun {
  filename: string;
  pagesDone: number;
  pagesTotal: number | null;
}

// Geschatte resttijd op basis van het gemiddelde van de al gedane pagina's.
function etaText(avgMsPerPage: number, pagesLeft: number): string {
  const seconds = Math.round((avgMsPerPage * pagesLeft) / 1000);
  if (seconds < 5) return "";
  if (seconds < 90) return ` — about ${seconds}s left`;
  return ` — about ${Math.round(seconds / 60)} min left`;
}

export function PdfUploadCard({
  dossierId,
  importAction,
  startOcrAction,
  ocrPageAction,
  finishOcrAction,
  pendingOcr,
}: {
  dossierId: string;
  importAction: PdfPagesImportAction;
  startOcrAction: StartOcrAction;
  ocrPageAction: OcrPageAction;
  finishOcrAction: FinishOcrAction;
  pendingOcr?: PendingOcrRun | null;
}) {
  // busy = voortgangstekst tijdens lezen/importeren/OCR; error = eerlijke foutmelding;
  // done = blijvende klaar-melding ná de OCR-loop (de redirect van finishOcrAction
  // navigeert normaliter meteen weg — dit is de eerlijke tussenstand tot die tijd).
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // ── De OCR-loop (beeld-PDF, 0 tekens tekstlaag) ────────────────────────────
  async function runOcrLoop(file: File, pageCount: number) {
    setBusy("No text layer found — starting OCR import…");
    const start = await startOcrAction({
      dossierId,
      filename: file.name,
      pageCount,
    });
    if ("error" in start) {
      // bv. geen API-key: eerlijke melding, er is niets gerenderd of geüpload.
      setError(start.error);
      return;
    }
    const donePages = new Set(start.donePages);
    const todo: number[] = [];
    for (let p = 1; p <= pageCount; p++) if (!donePages.has(p)) todo.push(p);

    // B1: het document één keer openen, pagina's strikt sequentieel renderen op
    // één hergebruikt canvas; elk beeld gaat direct de deur uit en de blob wordt
    // meteen losgelaten — nooit 31 blobs tegelijk in het geheugen.
    // NB: het bestand wordt hier opnieuw gelezen — pdfjs neemt de ArrayBuffer van
    // de tekstextractie over (transfer → detached), dus die bytes zijn al weg.
    const { openPdfDocument, renderPdfPageToJpeg } = await import(
      "@/lib/pdf/render"
    );
    const pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()));
    let failed = 0;
    let timedMs = 0;
    let timedPages = 0;
    try {
      const canvas = document.createElement("canvas");
      for (let i = 0; i < todo.length; i++) {
        const pageNo = todo[i];
        const resumePrefix =
          start.resumed && i === 0 ? `Resuming OCR from page ${pageNo} — ` : "";
        const eta =
          timedPages > 0 ? etaText(timedMs / timedPages, todo.length - i) : "";
        const failNote = failed > 0 ? ` (${failed} pages failed)` : "";
        setBusy(
          `${resumePrefix}Reading page ${pageNo}/${pageCount} with OCR…${eta}${failNote}`,
        );
        const t0 = performance.now();

        const rendered = await renderPdfPageToJpeg(pdf, pageNo, { canvas });
        const form = new FormData();
        form.set("dossierId", dossierId);
        form.set("runId", start.runId);
        form.set("page", String(pageNo));
        form.set("width", String(rendered.width));
        form.set("height", String(rendered.height));
        form.set(
          "image",
          new File([rendered.blob], `page-${pageNo}.jpg`, {
            type: "image/jpeg",
          }),
        );
        const result = await ocrPageAction(form);

        if ("stopped" in result) {
          // Budget op (run staat serverside op 'gestopt') of key weggevallen:
          // loop afbreken met een eerlijke melding hoeveel pagina's bleven liggen.
          const left = todo.length - i;
          setError(
            result.stopped === "budget"
              ? `OCR stopped: the €1 budget for this book is used up — ${left} of ${pageCount} pages were not read. The lines read so far are on the project.`
              : `OCR stopped: the AI key is missing — ${left} of ${pageCount} pages were not read. Once a key is configured, choose the same PDF to resume.`,
          );
          return;
        }
        if ("error" in result) {
          // Ongeldige aanroep/run — dit herhaalt zich op elke pagina, dus stoppen.
          setError(result.error);
          return;
        }
        // {failed}: per-pagina-fout is al gelogd (event) — tellen en doorgaan.
        if ("failed" in result) failed++;
        // {alreadyDone} of {created}: gewoon door naar de volgende pagina.
        timedMs += performance.now() - t0;
        timedPages++;
      }

      setBusy("Finishing OCR…");
      const form = new FormData();
      form.set("dossierId", dossierId);
      form.set("runId", start.runId);
      const finished = await finishOcrAction(form);
      if (finished && "error" in finished) {
        setError(finished.error);
        return;
      }
      // In echte Next redirect finishOcrAction zelf naar ?ocr=…&run=… — dit is de
      // eerlijke tussenstand tot de navigatie (en de zichtbare uitkomst in tests).
      setDone(
        failed > 0
          ? `OCR finished — ${failed} of ${pageCount} pages failed (see the events log); opening the results…`
          : "OCR finished — opening the results…",
      );
    } finally {
      // pdfjs-resources (gedecodeerde pagina's, worker-state) direct vrijgeven.
      pdf.destroy().catch(() => {});
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
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
      // 0 tekens tekstlaag in het hele document = beeld-PDF → OCR-pad. PDF's mét
      // tekst blijven exact het bestaande pad volgen (regressie-gedekt in de tests).
      const textChars = pages.reduce((n, p) => n + p.trim().length, 0);
      if (textChars === 0 && pages.length > 0) {
        await runOcrLoop(file, pages.length);
        return;
      }
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

  const idleLabel = pendingOcr
    ? pendingOcr.pagesTotal
      ? `Resume OCR (${pendingOcr.pagesDone} of ${pendingOcr.pagesTotal} pages done)`
      : `Resume OCR (${pendingOcr.pagesDone} pages done)`
    : "Import PDF";

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconUpload aria-hidden /> Upload luminaire schedule (PDF)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Upload the luminaire schedule — lines are matched automatically. PDFs
          with a text layer are parsed directly; scanned (image) PDFs are read
          page by page with OCR, and every read line gets a review. The source
          is kept with the import as an audit trail.
        </p>
        {pendingOcr && (
          <p className="mb-3 rounded-md border bg-muted/40 p-2.5 text-sm">
            An OCR import of{" "}
            <span className="font-medium">{pendingOcr.filename}</span> is still
            in progress ({pendingOcr.pagesDone} of{" "}
            {pendingOcr.pagesTotal ?? "?"} pages done). Choose the same PDF
            again to resume — pages already read are skipped and cost nothing
            extra.
          </p>
        )}
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
            {busy ?? idleLabel}
          </Button>
        </form>
        {busy && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {busy}
          </p>
        )}
        {done && !busy && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {done}
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
