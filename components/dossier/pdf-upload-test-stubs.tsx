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
        doneTiles: [],
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
        if (calls >= 4) return { stopped: "budget" };
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
