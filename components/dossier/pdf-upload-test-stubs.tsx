"use client";
// Test-only client-wrappers voor de PDF-upload-interactietests. De vitest-RSC-brug
// levert de return-waarde van een imperatief aangeroepen server-action niet terug
// (het {error}-object komt als undefined aan — vermoedelijk een harness-beperking;
// in echte Next werkt het return-pad wél). Daarom stubben we de action hier
// client-side: de kaartlogica (extractie, busy, {error} → alert, de OCR-loop) is
// dan volledig en eerlijk te testen; alleen de draad door de echte action-brug
// blijft buiten schot.
import {
  PdfUploadCard,
  type FinishOcrAction,
  type OcrPageAction,
  type StartOcrAction,
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
        donePages: [],
      })}
      ocrPageAction={async () => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        return { created: 1, duplicates: 0 };
      }}
      finishOcrAction={async () => {}}
    />
  );
}

// Budget-stop halverwege: pagina 1 slaagt, pagina 2 meldt {stopped: 'budget'} —
// de kaart moet de loop afbreken en eerlijk zeggen hoeveel pagina's bleven liggen.
export function KaartMetOcrBudgetStop() {
  return (
    <PdfUploadCard
      dossierId="d1"
      importAction={importOnverwacht}
      startOcrAction={async () => ({
        runId: "r1",
        resumed: false,
        donePages: [],
      })}
      ocrPageAction={async (form) => {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        if (Number(form.get("page")) >= 2) return { stopped: "budget" };
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
        donePages: [1, 2],
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
        donePages: [],
      })}
      ocrPageAction={() => new Promise(() => {})}
      finishOcrAction={finishOcrOnverwacht}
    />
  );
}
