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
//
// Liegende-import-melding (docs/probleem-liegende-import-melding.md): een action
// die redirect() doet, laat zijn client-promise REJECTEN — dat is Next'
// navigatiesignaal, geen fout. Die rejection werd hier door een lege catch tot
// "Import failed" verklaard, waardoor élke geslaagde import zich als mislukking
// meldde. Alle action-aanroepen lopen daarom nu via callAction(), die op
// BESTEMMING classificeert: alleen een redirect naar de eigen projectroute is
// succes, /login is een verlopen sessie, en al het overige is een fout.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { callAction, failureDetail } from "@/lib/next-action-result";
import { IconUpload } from "./icons";

// Client-side groottegrens: boven 100 MB laden we het bestand niet eens in het
// geheugen (file.arrayBuffer() kan de tab dan laten vastlopen). Gewone grote
// armaturenboeken (5–50 MB, veel foto's) blijven gewoon werken.
const MAX_CLIENT_PDF_BYTES = 100 * 1024 * 1024;

// NB de `void` in deze signatuur: die staat voor "de action gaf niets terug",
// maar in ECHTE Next is dat succespad onbereikbaar — bij succes redirect de
// action, en dan rejectet de promise met NEXT_REDIRECT in plaats van te
// resolven. TypeScript kan dat niet uitdrukken; callAction() vangt beide vormen
// op. (Een expliciet {ok:true}-contract i.p.v. redirect() is overwogen en
// bewust niet gedaan — zie docs/goal-liegende-import-melding.md §1 en HANDOVER.)
export type PdfPagesImportAction = (input: {
  dossierId: string;
  filename: string;
  pages: string[];
}) => Promise<{ error: string } | void>;

// Signatures spiegelen exact de server-actions in app/projects/actions.ts.
// O4 (A3-tiling, stap 5): de action levert gedane TEGELS ({page, tile}); tile 0
// = hele pagina (de dpi-drempel in lib/pdf/tiles.ts beslist per pagina).
export type StartOcrAction = (input: {
  dossierId: string;
  filename: string;
  pageCount: number;
}) => Promise<
  | { error: string }
  | { runId: string; resumed: boolean; doneTiles: { page: number; tile: number }[] }
>;

export type OcrPageAction = (formData: FormData) => Promise<
  | { error: string }
  | { alreadyDone: true }
  | { stopped: "budget_run" | "budget_month" | "no_key" }
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

// Geschatte resttijd. Sinds O4 (tiling) meten we per TEGEL: een A3-pagina is 12
// tegels en een A4-pagina 1 — per pagina middelen zou de ETA een factor 12
// laten liegen zodra de maten mengen. Resterend werk = tegels die nog moeten
// (voor nog-niet-geplande pagina's schatten we het tegelgemiddelde van de al
// geplande pagina's — lazy, geen upfront getPage-scan over 500 pagina's).
type CardStatus =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "handoff"; text: string }
  | { kind: "error"; text: string };

// Blijft de overdrachtstoestand langer dan dit staan, dan is er geen navigatie
// gekomen en zeggen we dat eerlijk in plaats van eeuwig "opening…" te tonen.
const HANDOFF_STUCK_MS = 10_000;

function useHangingHandoff(active: boolean): boolean {
  const [hanging, setHanging] = useState(false);
  useEffect(() => {
    if (!active) {
      setHanging(false);
      return;
    }
    const t = setTimeout(() => setHanging(true), HANDOFF_STUCK_MS);
    return () => clearTimeout(t);
  }, [active]);
  return hanging;
}

function etaText(avgMsPerTile: number, tilesLeft: number): string {
  const seconds = Math.round((avgMsPerTile * tilesLeft) / 1000);
  if (seconds < 5) return "";
  if (seconds < 90) return ` — about ${seconds}s left`;
  return ` — about ${Math.round(seconds / 60)} min left`;
}

// Stopreden → melding. Drie redenen, drie oplossingen: een vol €1-boekbudget gaat
// over DEZE run, een volle maandcap over de hele maand, en een ontbrekende key is
// helemaal geen geld. De never-tak dwingt af dat een vierde reden hier een
// typefout geeft in plaats van stil in een bestaande tak te vallen — precies de
// manier waarop budget_month zich als "€1-budget" voordeed.
function ocrStopMessage(
  reason: "budget_run" | "budget_month" | "no_key",
  left: number,
  pageCount: number,
): string {
  switch (reason) {
    case "budget_run":
      return `OCR stopped: the €1 budget for this book is used up — ${left} of ${pageCount} pages were not (fully) read. The lines read so far are on the project.`;
    case "budget_month":
      return `OCR stopped: the monthly AI budget is used up — ${left} of ${pageCount} pages were not (fully) read. The lines read so far are on the project. Raise the monthly cap in Settings, or wait for next month — another book will not help.`;
    case "no_key":
      return `OCR stopped: the AI key is missing — ${left} of ${pageCount} pages were not (fully) read. Once a key is configured, choose the same PDF to resume.`;
    default: {
      const onbekend: never = reason;
      throw new Error(`Onbekende OCR-stopreden: ${String(onbekend)}`);
    }
  }
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
  // Eén toestand in plaats van drie losse vlaggen. Dat is niet cosmetisch: de
  // gerapporteerde bug wás een groene succesbanner náást een rode foutregel, en
  // met een union kunnen 'handoff' en 'error' per constructie niet samen op het
  // scherm staan.
  //
  //  idle    — wachten op een bestand
  //  busy    — bezig (lezen/importeren/OCR), tekst wisselt mee met de voortgang
  //  handoff — uitkomst bekend én goed; Next navigeert, de kaart draagt over
  //  error   — eerlijke foutmelding, kaart weer vrij voor een nieuwe poging
  const [status, setStatus] = useState<CardStatus>({ kind: "idle" });
  const busy = status.kind === "busy" ? status.text : null;
  // Tijdens 'handoff' blijft het formulier op slot: de navigatie loopt nog en een
  // tweede upload zou op het OCR-pad opnieuw geld kosten.
  const locked = status.kind === "busy" || status.kind === "handoff";
  const setBusy = (text: string | null) =>
    setStatus((s) =>
      text != null
        ? { kind: "busy", text }
        : // busy wissen mag een 'handoff'/'error' die al gezet is nooit overschrijven
          s.kind === "busy"
          ? { kind: "idle" }
          : s,
    );
  const setError = (text: string) => setStatus({ kind: "error", text });
  const setHandoff = (text: string) => setStatus({ kind: "handoff", text });

  // Vangnet: normaliter vervangt de navigatie deze kaart binnen een seconde (de
  // projectpagina geeft hem een key uit de searchParams, dus hij remount schoon).
  // Blijft 'handoff' tóch staan, dan is de navigatie weggevallen — dat mag niet
  // stil zijn, ook niet als de classificatie hierboven ernaast zat.
  const hanging = useHangingHandoff(status.kind === "handoff");

  // ── De OCR-loop (beeld-PDF, 0 tekens tekstlaag) ────────────────────────────
  async function runOcrLoop(file: File, pageCount: number) {
    setBusy("No text layer found — starting OCR import…");
    // startOcrAction redirect niet, maar requireSession() erin wél (naar /login) —
    // daarom ook hier via callAction in plaats van een kale await.
    const started = await callAction(
      () => startOcrAction({ dossierId, filename: file.name, pageCount }),
      { path: `/projects/${dossierId}` },
    );
    if (started.kind === "signedOut") {
      setError(
        "Your session expired — nothing was read or uploaded. Sign in again and choose the same PDF.",
      );
      return;
    }
    if (started.kind !== "value") {
      setError(
        started.kind === "failed"
          ? `Could not start the OCR import (${failureDetail(started.error)}). Nothing was read or uploaded.`
          : `Starting the OCR import ended on an unexpected page (${started.href}) — nothing was read or uploaded.`,
      );
      return;
    }
    const start = started.value;
    if ("error" in start) {
      // bv. geen API-key: eerlijke melding, er is niets gerenderd of geüpload.
      setError(start.error);
      return;
    }
    // O4: gedane tegels als "page:tile"-sleutels; per pagina beslist
    // planPageTiles (dpi-drempel) of het één hele-pagina-beeld (tile 0) of een
    // reeks 300dpi-tegels wordt. Alleen ontbrekende tegels gaan de deur uit.
    // Randgeval: wijzigt de tegelgeometrie tussen deploys midden in een run, dan
    // vangt het (run,page,tile)-lock dubbele uploads (alreadyDone) en dedupt de
    // rijkste-wint-logica de regels — geen extra machinerie.
    const doneTiles = new Set(start.doneTiles.map((t) => `${t.page}:${t.tile}`));

    // B1: het document één keer openen, pagina's strikt sequentieel renderen op
    // één hergebruikt canvas; elk beeld gaat direct de deur uit en de blob wordt
    // meteen losgelaten — nooit 31 blobs tegelijk in het geheugen.
    // NB: het bestand wordt hier opnieuw gelezen — pdfjs neemt de ArrayBuffer van
    // de tekstextractie over (transfer → detached), dus die bytes zijn al weg.
    const { openPdfDocument, renderPdfTileToJpeg } = await import(
      "@/lib/pdf/render"
    );
    const { planPageTiles } = await import("@/lib/pdf/tiles");
    const pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()));
    let failed = 0; // pagina's met ≥1 gefaalde tegel (de eenheid die Timo kent)
    let timedMs = 0;
    let timedTiles = 0;
    let plannedTiles = 0;
    let plannedPages = 0;
    let sentResumePrefix = start.resumed;
    try {
      const canvas = document.createElement("canvas");
      for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
        // Lazy per pagina plannen: pt-maten pas opvragen als de pagina aan de
        // beurt is; cleanup pas ná de laatste tegel van de pagina zodat het
        // bronbeeld één keer per pagina gedecodeerd wordt.
        const page = await pdf.getPage(pageNo);
        try {
          const base = page.getViewport({ scale: 1 });
          const tiles = planPageTiles(base.width, base.height);
          plannedTiles += tiles.length;
          plannedPages++;
          const missing = tiles.filter(
            (t) => !doneTiles.has(`${pageNo}:${t.tile}`),
          );
          let pageFailed = false;
          for (let j = 0; j < missing.length; j++) {
            const tile = missing[j];
            const resumePrefix =
              sentResumePrefix ? `Resuming OCR from page ${pageNo} — ` : "";
            sentResumePrefix = false;
            // Resterende tegels: rest van deze pagina + (tegelgemiddelde van de
            // al geplande pagina's × resterende pagina's).
            const avgTilesPerPage = plannedTiles / plannedPages;
            const tilesLeft =
              missing.length - j + avgTilesPerPage * (pageCount - pageNo);
            const eta =
              timedTiles > 0 ? etaText(timedMs / timedTiles, tilesLeft) : "";
            const failNote = failed > 0 ? ` (${failed} pages failed)` : "";
            const tileNote =
              tiles.length > 1 ? ` (tile ${tile.tile}/${tiles.length})` : "";
            setBusy(
              `${resumePrefix}Reading page ${pageNo}/${pageCount} with OCR…${tileNote}${eta}${failNote}`,
            );
            const t0 = performance.now();

            const rendered = await renderPdfTileToJpeg(page, tile, { canvas });
            const form = new FormData();
            form.set("dossierId", dossierId);
            form.set("runId", start.runId);
            form.set("page", String(pageNo));
            form.set("tile", String(tile.tile));
            form.set("tileCount", String(tiles.length));
            form.set("width", String(rendered.width));
            form.set("height", String(rendered.height));
            form.set(
              "image",
              new File([rendered.blob], `page-${pageNo}-tile-${tile.tile}.jpg`, {
                type: "image/jpeg",
              }),
            );
            // Ook hier kan requireSession() midden in een lange run de sessie
            // afkappen; die redirect mag nooit als "pagina gelukt" gelden.
            const sent = await callAction(() => ocrPageAction(form), {
              path: `/projects/${dossierId}`,
            });
            if (sent.kind === "signedOut") {
              const left = pageCount - pageNo + 1;
              setError(
                `Your session expired during the OCR run — ${left} of ${pageCount} pages were not (fully) read. The lines read so far are saved; sign in again and choose the same PDF to resume.`,
              );
              return;
            }
            if (sent.kind !== "value") {
              const left = pageCount - pageNo + 1;
              setError(
                sent.kind === "failed"
                  ? `OCR stopped on page ${pageNo} (${failureDetail(sent.error)}) — ${left} of ${pageCount} pages were not (fully) read. The lines read so far are saved; choose the same PDF to resume.`
                  : `OCR stopped on page ${pageNo}: the request ended on an unexpected page (${sent.href}). The lines read so far are saved.`,
              );
              return;
            }
            const result = sent.value;

            if ("stopped" in result) {
              // Drie gevallen, en het verschil is voor de gebruiker niet cosmetisch:
              // het €1-plafond van DEZE run, de maandcap, of een weggevallen key.
              // Bij beide budgetredenen zet de repo-laag de run op 'gestopt'
              // (terminaal, lib/repo/ocr.ts 629-635); bij no_key blijft hij 'bezig'
              // en is hervatten met hetzelfde bestand dus wél zinnig. Beide lussen
              // breken af met een eerlijke melding. Een pagina kan half gelezen zijn
              // (tegels 1–k) — die regels blijven staan, net als vroeger de regels
              // van eerdere pagina's bij een stop.
              const left = pageCount - pageNo + 1;
              setError(ocrStopMessage(result.stopped, left, pageCount));
              return;
            }
            if ("error" in result) {
              // Ongeldige aanroep/run — dit herhaalt zich op elke tegel, dus stoppen.
              setError(result.error);
              return;
            }
            // {failed}: per-tegel-fout is al gelogd (event) — pagina markeren, doorgaan.
            if ("failed" in result) pageFailed = true;
            // {alreadyDone} of {created}: gewoon door naar de volgende tegel.
            timedMs += performance.now() - t0;
            timedTiles++;
          }
          if (pageFailed) failed++;
        } finally {
          page.cleanup();
        }
      }

      setBusy("Finishing OCR…");
      const form = new FormData();
      form.set("dossierId", dossierId);
      form.set("runId", start.runId);
      // finishOcrAction redirect bij succes naar ?ocr=…&run=… — de promise
      // REJECT dan (zie de kop van dit bestand). Vóór deze fix belandde dat in de
      // buitenste catch en meldde een geslaagde OCR-run zich als "Import failed";
      // de afrondmelding hieronder was daardoor dode code op de deploy.
      const finished = await callAction(() => finishOcrAction(form), {
        path: `/projects/${dossierId}`,
      });
      if (finished.kind === "failed") {
        // De gelezen regels stáán al op het project. "Opnieuw proberen" is hier
        // schadelijke raad: hervatten kost niets extra, opnieuw beginnen wel.
        setError(
          `OCR finished reading, but closing the run failed (${failureDetail(finished.error)}). The pages that were read are saved — choose the same PDF again to resume; already-read pages cost nothing extra.`,
        );
        return;
      }
      if (finished.kind === "signedOut") {
        // Geen verzonnen faaltelling hier: requireSession() staat vóór alles in
        // de action, dus de run is niet afgesloten en we weten de uitkomst niet.
        setError(
          "Your session expired before the OCR run could be closed. The pages that were read are saved — sign in again and choose the same PDF to resume; already-read pages cost nothing extra.",
        );
        return;
      }
      if (finished.kind === "divertedTo") {
        setError(
          `Finishing the OCR run ended on an unexpected page (${finished.href}) — the run was not confirmed. The pages that were read are saved; check the events log before retrying.`,
        );
        return;
      }
      if (finished.kind === "value" && finished.value && "error" in finished.value) {
        setError(finished.value.error);
        return;
      }
      // 'arrived' (productie: de redirect kwam waar hij hoorde) én 'value: void'
      // (stub/geen-redirect) betekenen allebei: klaar.
      setHandoff(
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
    setStatus({ kind: "idle" });
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
      // Bij succes redirect de action naar /projects/<id>?pdf=…&run=… en rejectet
      // de promise met NEXT_REDIRECT. callAction() classificeert op bestemming;
      // alles wat niet aantoonbaar op de eigen projectroute uitkomt, is een fout.
      const result = await callAction(
        () => importAction({ dossierId, filename: file.name, pages }),
        { path: `/projects/${dossierId}` },
      );
      if (result.kind === "failed") {
        setError(
          `The import did not complete (${failureDetail(result.error)}). Check this project's events log to see whether lines were saved before retrying.`,
        );
        return;
      }
      if (result.kind === "signedOut") {
        // requireSession() staat vóór elke schrijfactie — er is dus aantoonbaar
        // niets geïmporteerd.
        setError(
          "Your session expired before anything was imported — nothing was saved. Sign in again and choose the same PDF.",
        );
        return;
      }
      if (result.kind === "divertedTo") {
        setError(
          `The import ended on an unexpected page (${result.href}) — nothing was confirmed. Check this project's events log before retrying.`,
        );
        return;
      }
      if (result.kind === "value" && result.value && "error" in result.value) {
        setError(result.value.error);
        return;
      }
      setHandoff("Import complete — opening the results…");
    } catch (e) {
      // Crash-net, geen vuilnisbak. Een redirect hoort al bij de aanroep zelf
      // gevangen te zijn; wat hier landt is een échte fout (bv. de rasterisatie
      // in runOcrLoop die omvalt) en die was tot nu toe onzichtbaar achter de
      // generieke "Import failed".
      setError(
        `Something went wrong while processing this PDF (${failureDetail(e)}). Check this project's events log before retrying.`,
      );
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
            disabled={locked}
            aria-label="Choose luminaire schedule PDF"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
          />
          <Button type="submit" disabled={locked}>
            {busy ?? idleLabel}
          </Button>
        </form>
        {(status.kind === "busy" || status.kind === "handoff") && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {status.text}
            {status.kind === "handoff" && hanging && (
              <>
                {" "}
                Still opening the results — the import itself is done; reload the
                page if this stays.
              </>
            )}
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {status.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
