"use client";
// Test-only client-wrappers voor de PDF-upload-interactietests. De vitest-RSC-brug
// levert de return-waarde van een imperatief aangeroepen server-action niet terug
// (het {error}-object komt als undefined aan — vermoedelijk een harness-beperking;
// in echte Next werkt het return-pad wél). Daarom stubben we de action hier
// client-side: de kaartlogica (extractie, busy, {error} → alert, de OCR-loop) is
// dan volledig en eerlijk te testen; alleen de draad door de echte action-brug
// blijft buiten schot.
import { notFound, redirect } from "next/navigation";
import {
  PdfUploadCard,
  type FinishOcrAction,
  type FinishTableImportAction,
  type ImportTabelRowsAction,
  type OcrPageAction,
  type StartOcrAction,
  type StartTableImportAction,
  type UploadSourceChunkAction,
} from "./pdf-upload-card";

// "Mag niet gebeuren"-stubs: komt de kaart tóch op dit pad, dan verschijnt de
// marker als alert en faalt de assert `not.toContain(...)` in de test.
const startOcrOnverwacht: StartOcrAction = async () => ({
  error: "OCR-PAD-ONVERWACHT: startOcrAction aangeroepen.",
});
const ocrPageOnverwacht: OcrPageAction = async () => ({
  error: "OCR-PAD-ONVERWACHT: ocrPageAction aangeroepen.",
});
const finishOcrOnverwacht: FinishOcrAction = async () => ({
  error: "OCR-PAD-ONVERWACHT: finishOcrAction aangeroepen.",
});
const importOnverwacht = async () => ({
  error: "GEWONE-IMPORT-ONVERWACHT: importAction aangeroepen.",
});

export function KaartMetErrorAction() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => ({ error: "Testfout: import geweigerd." })}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
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
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// ── OCR-loop-stubs (bouwstap 5) ──────────────────────────────────────────────
// Elke pagina-call duurt bewust ~120 ms: zo vangt de DOM-sampler in de test de
// voortgangsteksten ("Reading page 1/2 with OCR…") betrouwbaar op.
const PAGE_DELAY_MS = 120;

// Happy path: run start vers, elke pagina slaagt, finish rondt af (in echte Next
// redirect finishOcrAction dan; hier toont de kaart zijn klaar-status).
export function KaartMetOcrHappy() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        doneTiles: [],
      })}
      ocrPageAction={async () => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {}}
    />
  );
}

// Budget-stop halverwege: pagina 1 slaagt, pagina 2 meldt {stopped: 'budget_run'}
// — het €1-plafond van DEZE run. De kaart moet de loop afbreken en eerlijk zeggen
// hoeveel pagina's bleven liggen.
export function KaartMetOcrBudgetStop() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        doneTiles: [],
      })}
      ocrPageAction={async (form) => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        if (Number(form.get("page")) >= 2) return { stopped: "budget_run" };
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// Dezelfde stop, ándere oorzaak: de MAANDcap (llm_budget_eur) is op, niet het
// €1-boekbudget. Een nieuw boek helpt hier niet — de melding moet dat zeggen.
// Deze stub bestaat omdat de action beide redenen tot één 'budget' plette; toen
// was dit scenario niet na te bootsen en loog de melding ongemerkt.
export function KaartMetOcrMaandbudgetStop() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        doneTiles: [],
      })}
      ocrPageAction={async (form) => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        if (Number(form.get("page")) >= 2) return { stopped: "budget_month" };
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// Hervatten (B5): pagina 1 en 2 zijn al gedaan — de loop mag alléén pagina 3
// sturen. Elke andere pagina levert een fout-alert op en laat de test falen.
export function KaartMetOcrResume() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: true,
        // De testfixtures zijn kleine (≤400 pt) pagina's → één tegel (tile 0)
        // per pagina; pagina 1 en 2 volledig gedaan = alleen pagina 3 rest.
        doneTiles: [
          { page: 1, tile: 0 },
          { page: 2, tile: 0 },
        ],
      })}
      ocrPageAction={async (form) => {
        const page = Number(form.get("page"));
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        if (page !== 3) {
          return {
            error: `HERVAT-FOUT: pagina ${page} was al gedaan en werd tóch gestuurd.`,
          };
        }
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {}}
    />
  );
}

// Geen API-key: startOcrImportAction weigert vóór er iets gerenderd is.
export function KaartMetOcrStartError() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        error:
          "OCR is unavailable: no AI key is configured. Add the fixture rows manually or via CSV.",
      })}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// ── O4 (stap 5): tegel-stubs — A3-pagina's gaan in 12 tegels de deur uit ─────

// Tegel-flow: registreert elke (page,tile)-combinatie die de kaart verstuurt,
// zodat de test de volledige reeks kan asserteren. Elke call slaagt.
// NB: registratie via window — een module-export komt door de RSC-testbrug als
// client-referentie (function) aan in de test, niet als de array zelf.
declare global {
  interface Window {
    __verzondenTegels?: string[];
  }
}
function registreerTegel(form: FormData) {
  (window.__verzondenTegels ??= []).push(
    `${form.get("page")}:${form.get("tile")}`,
  );
}
export function KaartMetOcrTegels() {
  if (typeof window !== "undefined") window.__verzondenTegels = [];
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        doneTiles: [],
      })}
      ocrPageAction={async (form) => {
        registreerTegel(form);
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {}}
    />
  );
}

// Hervatten met een half getegelde pagina: pagina 1 volledig (12 tegels),
// pagina 2 half (tegels 1–6). Alleen de ontbrekende tegels mogen de deur uit;
// een al gedane tegel levert een HERVAT-FOUT-alert en laat de test falen.
export function KaartMetOcrResumeHalveTegels() {
  if (typeof window !== "undefined") window.__verzondenTegels = [];
  const done: { page: number; tile: number }[] = [];
  for (let t = 1; t <= 12; t++) done.push({ page: 1, tile: t });
  for (let t = 1; t <= 6; t++) done.push({ page: 2, tile: t });
  const doneSet = new Set(done.map((d) => `${d.page}:${d.tile}`));
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({ runId: "r1", resumed: true, doneTiles: done })}
      ocrPageAction={async (form) => {
        const key = `${form.get("page")}:${form.get("tile")}`;
        if (doneSet.has(key)) {
          return { error: `HERVAT-FOUT: tegel ${key} was al gedaan en werd tóch gestuurd.` };
        }
        registreerTegel(form);
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {}}
    />
  );
}

// Budget-stop midden in een pagina: tegel 1–3 slagen, tegel 4 meldt {stopped} —
// de kaart moet beide lussen afbreken en "(fully)" in de melding zetten.
export function KaartMetOcrBudgetStopMidPagina() {
  let calls = 0;
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        doneTiles: [],
      })}
      ocrPageAction={async () => {
        calls++;
        if (calls >= 4) return { stopped: "budget_run" };
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// Voor de voortgangs-screenshots: de eerste pagina-call blijft hangen, dus de
// kaart staat stabiel in "Reading page 1/N with OCR…" tot de screenshot er is.
export function KaartMetOcrHangend() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        doneTiles: [],
      })}
      ocrPageAction={() => new Promise(() => {})}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// ── Redirect-stubs (goal-liegende-import-melding) ────────────────────────────
// DIT is wat de vorige stubs misten. Een server action die redirect() aanroept,
// laat zijn client-promise niet resolven maar REJECTEN (server-action-reducer.js
// 215-234). De oude stubs deden `async () => {}` — een nette resolve, precies het
// enige geval dat Next nooit produceert. Daardoor bleef de suite groen terwijl
// productie elke geslaagde import "Import failed" noemde.
//
// De fixture wordt gebouwd met Next' EIGEN redirect(), niet met een zelfgetypte
// digest-string: dan is hij per constructie echt. lib/next-action-result.test.ts
// pint dat vast tegen Next' eigen isRedirectError.

export function nextRedirectError(href: string): Error {
  try {
    redirect(href, "push");
  } catch (e) {
    // De reducer zet handled=true vóór hij ermee rejectet.
    (e as { handled?: boolean }).handled = true;
    return e as Error;
  }
  throw new Error("redirect() gooide niet — fixture ongeldig");
}

function nextNotFoundError(): Error {
  try {
    notFound();
  } catch (e) {
    return e as Error;
  }
  throw new Error("notFound() gooide niet — fixture ongeldig");
}

// De echte productie-succesroute: de import slaagt en de action redirect naar de
// eigen projectpagina met ?pdf=…&run=…. Vóór de fix toonde dit "Import failed".
export function KaartMetRedirectendeImport() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => {
        throw nextRedirectError("/projects/d1?pdf=20&run=r1&route=leesroute");
      }}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// Idem voor het OCR-pad: alle pagina's slagen, finishOcrAction redirect.
export function KaartMetRedirectendeFinishOcr() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({ runId: "r1", resumed: false, doneTiles: [] })}
      ocrPageAction={async () => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {
        throw nextRedirectError("/projects/d1?ocr=12&run=r1");
      }}
    />
  );
}

// Gefaalde pagina's + redirectende finish. De telling "N of M pages failed" is
// in productie nog NOOIT vertoond: hij stond achter de dode setDone().
export function KaartMetOcrGefaaldePaginas() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({ runId: "r1", resumed: false, doneTiles: [] })}
      ocrPageAction={async (form) => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        // pagina 1 en 2 mislukken, pagina 3 slaagt → "2 of 3 pages failed"
        if (Number(form.get("page")) <= 2) return { failed: "vision-timeout" };
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {
        throw nextRedirectError("/projects/d1?ocr=1&run=r1");
      }}
    />
  );
}

// F3: sessie verlopen tijdens de run → requireSession() redirect naar /login.
// Dat is óók een NEXT_REDIRECT, maar het is GEEN succes: er is niets afgesloten.
export function KaartMetSessieRedirect() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({ runId: "r1", resumed: false, doneTiles: [] })}
      ocrPageAction={async () => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {
        throw nextRedirectError("/login");
      }}
    />
  );
}

// Redirect naar een onverwachte bestemming → default-deny: dit is geen succes.
export function KaartMetOnverwachteBestemming() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => {
        throw nextRedirectError("/data/brands");
      }}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// Negatieve controle: een échte netwerkfout moet zichtbaar blijven, mét oorzaak.
export function KaartMetNetwerkfout() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => {
        throw new TypeError("Failed to fetch");
      }}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// notFound()/forbidden() uit een action: GEEN navigatiesignaal voor ons — de
// action weigerde, en dat moet de gebruiker zien in plaats van stilte.
export function KaartMetNotFound() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={async () => {
        throw nextNotFoundError();
      }}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// ── Tabelbron-stubs (goal-import-meer-formaten, Bouwer B) ────────────────────
// Zelfde harness-beperking als bovenaan: de actions zijn client-side stubs; de
// kaartlogica (typeherkenning, chunk-loop, >15 MB-fallback, callAction-uitkomsten)
// wordt volledig en eerlijk getest.

const tabelOnverwacht = {
  startTableImportAction: (async () => ({
    error: "TABEL-PAD-ONVERWACHT: startTableImportAction aangeroepen.",
  })) satisfies StartTableImportAction,
  uploadSourceChunkAction: (async () => ({
    error: "TABEL-PAD-ONVERWACHT: uploadSourceChunkAction aangeroepen.",
  })) satisfies UploadSourceChunkAction,
  finishTableImportAction: (async () => ({
    error: "TABEL-PAD-ONVERWACHT: finishTableImportAction aangeroepen.",
  })) satisfies FinishTableImportAction,
  importTabelRowsAction: (async () => ({
    error: "TABEL-PAD-ONVERWACHT: importTabelRowsAction aangeroepen.",
  })) satisfies ImportTabelRowsAction,
};

// Registratie via window (zie __verzondenTegels hierboven): wat de chunk-loop
// werkelijk verstuurde, en wat de rijen-fallback aanleverde.
declare global {
  interface Window {
    __verzondenChunks?: string[];
    __tabelStart?: { filename: string }[];
    __rijenImport?: {
      filename: string;
      rows: string[][];
      sheetName?: string;
      sheetCount?: number;
    }[];
    __tabelFinish?: { sheetIndex?: number }[];
    __ocrStarts?: { filename: string; pageCount: number }[];
  }
}

// Happy path xlsx/csv: start vers, elke chunk slaagt, finish redirect naar
// ?tabel=…&run=… — de productie-succesroute.
export function KaartMetTabelHappy() {
  if (typeof window !== "undefined") {
    window.__verzondenChunks = [];
    window.__tabelStart = [];
  }
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={async (input) => {
        window.__tabelStart?.push({ filename: input.filename });
        return { runId: "r9", doneChunks: [] };
      }}
      uploadSourceChunkAction={async (form) => {
        (window.__verzondenChunks ??= []).push(String(form.get("chunk")));
        return { ok: true, alreadyDone: false };
      }}
      finishTableImportAction={async () => {
        throw nextRedirectError("/projects/d1?tabel=5&run=r9");
      }}
      importTabelRowsAction={tabelOnverwacht.importTabelRowsAction}
    />
  );
}

// Hervatten: chunk 0 was al binnen (doneChunks) — alleen de rest mag de deur uit.
export function KaartMetTabelResumeChunks() {
  if (typeof window !== "undefined") window.__verzondenChunks = [];
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={async () => ({ runId: "r9", doneChunks: [0] })}
      uploadSourceChunkAction={async (form) => {
        const chunk = Number(form.get("chunk"));
        if (chunk === 0) {
          return { error: "HERVAT-FOUT: chunk 0 was al gedaan en werd tóch gestuurd." };
        }
        (window.__verzondenChunks ??= []).push(String(chunk));
        return { ok: true, alreadyDone: false };
      }}
      finishTableImportAction={async () => {
        throw nextRedirectError("/projects/d1?tabel=3&run=r9");
      }}
      importTabelRowsAction={tabelOnverwacht.importTabelRowsAction}
    />
  );
}

// Fout halverwege de chunk-loop: de kaart moet eerlijk melden welk deel faalde
// en dat opnieuw kiezen de al geüploade delen overslaat.
export function KaartMetTabelChunkFout() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={async () => ({ runId: "r9", doneChunks: [] })}
      uploadSourceChunkAction={async (form) => {
        if (Number(form.get("chunk")) >= 1) {
          throw new TypeError("Failed to fetch");
        }
        return { ok: true, alreadyDone: false };
      }}
      finishTableImportAction={tabelOnverwacht.finishTableImportAction}
      importTabelRowsAction={tabelOnverwacht.importTabelRowsAction}
    />
  );
}

// >15 MB-fallback: de bron blijft achter, de client leest de rijen zelf en
// stuurt alléén die naar importTabelRowsAction (die daarna redirect).
export function KaartMetRijenFallback() {
  if (typeof window !== "undefined") window.__rijenImport = [];
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={tabelOnverwacht.startTableImportAction}
      uploadSourceChunkAction={tabelOnverwacht.uploadSourceChunkAction}
      finishTableImportAction={tabelOnverwacht.finishTableImportAction}
      importTabelRowsAction={async (input) => {
        window.__rijenImport?.push({
          filename: input.filename,
          // Alleen kop + eerste rijen vastleggen: 15 MB rijen serialiseren zou
          // de test zelf traag maken.
          rows: input.rows.slice(0, 3),
        });
        throw nextRedirectError("/projects/d1?tabel=2&run=r9");
      }}
    />
  );
}

// Action antwoordt {error} op het tabelpad (bv. zod-weigering server-side).
export function KaartMetTabelStartError() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={async () => ({
        error: "Testfout: tabelimport geweigerd.",
      })}
      uploadSourceChunkAction={tabelOnverwacht.uploadSourceChunkAction}
      finishTableImportAction={tabelOnverwacht.finishTableImportAction}
      importTabelRowsAction={tabelOnverwacht.importTabelRowsAction}
    />
  );
}

// Losse beelden (png/jpg): OCR-loop zonder pdfjs — start registreert filename +
// pageCount, elke pagina slaagt, finish redirect.
export function KaartMetBeeldOcr() {
  if (typeof window !== "undefined") {
    window.__ocrStarts = [];
    window.__verzondenTegels = [];
  }
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async (input) => {
        window.__ocrStarts?.push({
          filename: input.filename,
          pageCount: input.pageCount,
        });
        return { runId: "r1", resumed: false, doneTiles: [] };
      }}
      ocrPageAction={async (form) => {
        registreerTegel(form);
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {
        throw nextRedirectError("/projects/d1?ocr=2&run=r1");
      }}
      {...tabelOnverwacht}
    />
  );
}

// Alle actions "mag niet gebeuren": voor de onbekend-type- en mixed-multi-tests
// — élke aangeraakte action verraadt zich met een marker-alert.
export function KaartAllesOnverwacht() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      {...tabelOnverwacht}
    />
  );
}

// Crash midden in de OCR-lus (bv. rasterisatie die omvalt): tot nu toe volledig
// onzichtbaar achter de generieke "Import failed".
export function KaartMetCrashInLoop() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({ runId: "r1", resumed: false, doneTiles: [] })}
      ocrPageAction={async (form) => {
        if (Number(form.get("page")) >= 2) throw new Error("canvas kapot");
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}

// ── Tabbladkeuze (goal-meerdere-tabbladen) ───────────────────────────────────

// Twee tabbladen met regels: de eerste finish antwoordt {sheetChoice} en importeert
// niets; ná de keuze gaat dezelfde finish nog eens de deur uit, nu mét sheetIndex.
export function KaartMetTabelSheetKeuze() {
  if (typeof window !== "undefined") {
    window.__tabelFinish = [];
    window.__verzondenChunks = [];
  }
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={async () => ({ runId: "r9", doneChunks: [] })}
      uploadSourceChunkAction={async (form) => {
        (window.__verzondenChunks ??= []).push(String(form.get("chunk")));
        return { ok: true, alreadyDone: false };
      }}
      finishTableImportAction={async (input) => {
        (window.__tabelFinish ??= []).push({ sheetIndex: input.sheetIndex });
        if (input.sheetIndex == null) {
          return {
            sheetChoice: {
              sheets: [
                { index: 1, name: "Delta Light", lines: 42 },
                { index: 2, name: "Wever en Ducre", lines: 42 },
              ],
              skipped: 1,
            },
          };
        }
        throw nextRedirectError(`/projects/d1?tabel=42&run=r9&blad=${input.sheetIndex}`);
      }}
      importTabelRowsAction={tabelOnverwacht.importTabelRowsAction}
    />
  );
}

// >15 MB-pad met een werkboek van twee databladen: de keuze valt in de browser, en
// alléén de rijen van het gekozen blad gaan de deur uit.
export function KaartMetRijenFallbackMeerdereBladen() {
  if (typeof window !== "undefined") window.__rijenImport = [];
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={startOcrOnverwacht}
      ocrPageAction={ocrPageOnverwacht}
      finishOcrAction={finishOcrOnverwacht}
      startTableImportAction={tabelOnverwacht.startTableImportAction}
      uploadSourceChunkAction={tabelOnverwacht.uploadSourceChunkAction}
      finishTableImportAction={tabelOnverwacht.finishTableImportAction}
      importTabelRowsAction={async (input) => {
        window.__rijenImport?.push({
          filename: input.filename,
          rows: input.rows,
          sheetName: input.sheetName,
          sheetCount: input.sheetCount,
        });
        throw nextRedirectError("/projects/d1?tabel=2&run=r9");
      }}
    />
  );
}
