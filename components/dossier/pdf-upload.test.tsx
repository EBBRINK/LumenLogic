// White-box RSC-screenshottests voor stap 5: de projectpagina met de PDF-upload als
// éérste blok boven de regeltabel, en de importrun-pagina met het inklapbare
// markdown-controlespoor + downloadknop. Licht/donker × mobiel/desktop.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { PDFDocument } from "pdf-lib";
import {
  noopAction,
  noopOcrPageAction,
  noopStartOcrAction,
} from "@/lib/test-actions";
import {
  KaartMetErrorAction,
  KaartMetOcrBudgetStop,
  KaartMetOcrBudgetStopMidPagina,
  KaartMetOcrHangend,
  KaartMetOcrHappy,
  KaartMetOcrResume,
  KaartMetOcrResumeHalveTegels,
  KaartMetOcrStartError,
  KaartMetOcrTegels,
  KaartMetTrageErrorAction,
  // goal-liegende-import-melding: stubs die een REDIRECTENDE action nabootsen
  // zoals Next hem werkelijk aflevert (reject, geen resolve).
  KaartMetCrashInLoop,
  KaartMetNetwerkfout,
  KaartMetNotFound,
  KaartMetOcrGefaaldePaginas,
  KaartMetOnverwachteBestemming,
  KaartMetRedirectendeFinishOcr,
  KaartMetRedirectendeImport,
  KaartMetSessieRedirect,
} from "./pdf-upload-test-stubs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSpecLineForm } from "./add-spec-line-form";
import { ImportMarkdown } from "./import-markdown";
import { PdfUploadCard } from "./pdf-upload-card";
import { SpecLineTable } from "./spec-line-table";
import type { SpecLineRow } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const specLines: SpecLineRow[] = [
  {
    id: "s1", fixtureCode: "Lp301", quantity: 12, brandText: "XAL",
    productText: "SASSO 100", reqKelvin: 3000, reqCri: 90, reqIp: "IP20",
    status: "groen", matchedProductId: "p1",
    matchedName: "SASSO 100 SQ SP CEIL 3000K", matchedBrand: "XAL",
    matchedArticleCode: "L360-SASSO100", matchedPrice: "310.00",
  },
  {
    id: "s2", fixtureCode: "Lw201", quantity: 8, brandText: "Wever & Ducré",
    productText: "SCAVA 1.0", reqKelvin: 3000, reqCri: null, reqIp: null,
    status: "geel", matchedProductId: "p2",
    matchedName: "SCAVA WALL SURF 1.0 LED 3000K", matchedBrand: "Wever & Ducré",
    matchedArticleCode: "L092-SCAVA", matchedPrice: "226.00",
  },
];

const markdown = [
  "## Pagina 1",
  "",
  "Nieuwbouw Kantoorpand De Boog — Armaturenboek",
  "Inhoudsopgave — te leveren armaturen",
  "Lp301 XAL SASSO 100 SQ SP CEIL 3000K 12",
  "Lw201 Wever & Ducré SCAVA 1.0 26",
  "",
  "## Pagina 2",
  "",
  "Lp601 XAL PHANTOMDELUXE ZX9000 31",
].join("\n");

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </div>
  );
}

// De projectpagina in het klein: PDF-upload éérst, dan de regels, dan de overige
// invoerwegen — dezelfde volgorde als app/projects/[id]/page.tsx.
function ProjectRegelsScreen() {
  return (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        Ziekenhuis Noord
      </h1>
      <PdfUploadCard
        dossierId="d1"
        importAction={noopAction}
        startOcrAction={noopStartOcrAction}
        ocrPageAction={noopOcrPageAction}
        finishOcrAction={noopAction}
      />
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Regels (2)</h2>
        <SpecLineTable dossierId="d1" lines={specLines} deleteAction={noopAction} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Regels toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSpecLineForm
            dossierId="d1"
            addLineAction={noopAction}
            addCsvAction={noopAction}
          />
        </CardContent>
      </Card>
    </Screen>
  );
}

// De importrun-pagina van een bevestigde PDF-import: samenvatting + open md-blok.
function ImportRunScreen() {
  return (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        Importrun — armaturenboek.pdf
      </h1>
      <p className="text-sm text-muted-foreground">
        PDF-import van armaturenboek.pdf — 2 regels toegevoegd en gematcht. De
        regels staan bij het project; hieronder staat de brontekst als
        controlespoor.
      </p>
      <ImportMarkdown
        markdown={markdown}
        downloadHref="/projects/d1/import/r1/markdown"
        defaultOpen
      />
    </Screen>
  );
}

// B5-toestand: bij een paginabezoek staat er nog een OCR-run 'bezig' — de kaart
// toont dan het hervat-blok met de voortgang (12 van 31) en de hervat-knop.
function OcrResumeScreen() {
  return (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        Ziekenhuis Noord
      </h1>
      <PdfUploadCard
        dossierId="d1"
        importAction={noopAction}
        startOcrAction={noopStartOcrAction}
        ocrPageAction={noopOcrPageAction}
        finishOcrAction={noopAction}
        pendingOcr={{
          filename: "deerns-armaturenboek.pdf",
          pagesDone: 12,
          pagesTotal: 31,
        }}
      />
    </Screen>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Per scherm een "klaar"-tekst: zo staat de RSC-stream écht op het scherm vóór de
// screenshot (alleen op document.body wachten gaf af en toe een leeg plaatje).
const screens = {
  "project-pdf-upload": {
    ui: <ProjectRegelsScreen />,
    ready: "Regels toevoegen",
  },
  "importrun-markdown": {
    ui: <ImportRunScreen />,
    ready: "Source text (markdown)",
  },
  "project-ocr-resume": {
    ui: <OcrResumeScreen />,
    ready: "Resume OCR (12 of 31 pages done)",
  },
} as const;

for (const [name, { ui, ready }] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect.element(page.getByText(ready)).toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// De upload-kaart is het éérste blok: hij staat in de DOM vóór de regeltabel.
test("PDF-upload staat boven de regeltabel", async () => {
  const { container } = await renderServer(<ProjectRegelsScreen />);
  await expect
    .element(page.getByText("Upload luminaire schedule (PDF)"))
    .toBeInTheDocument();
  const upload = container.querySelector('input[type="file"][name="pdf"]');
  const tabel = container.querySelector("table");
  expect(upload).toBeTruthy();
  expect(tabel).toBeTruthy();
  // DOCUMENT_POSITION_FOLLOWING (4): de tabel komt ná de upload-input.
  expect(upload!.compareDocumentPosition(tabel!) & 4).toBe(4);
  // korte uitleg staat erbij
  await expect
    .element(page.getByText(/lines are matched automatically/i))
    .toBeInTheDocument();
});

// ── Interactietests (413-fix nafix 1): de client-side upload-flow zelf ──────────────
// Echte browser-extractie (unpdf) + echte server-action-aanroepen via de RSC-testbrug;
// alleen de action-uitkomst is een test-stub (error/slow) — niets aan de kaart gemockt.

// Hydration-wachtlus (zelfde soort race als brand-message.test.tsx): vóór hydratatie
// zou de klik een native GET-submit doen die de testpagina wegnavigeert. We wachten
// tot React zijn props aan het formulier heeft gehangen en interacteren pas daarna.
async function uploadEnVerstuur(file: File | string) {
  await vi.waitFor(
    () => {
      const form = document.querySelector("form");
      if (
        !form ||
        !Object.keys(form).some((k) => k.startsWith("__reactProps"))
      ) {
        throw new Error("formulier nog niet gehydrateerd");
      }
    },
    { timeout: 10_000, interval: 100 },
  );
  await userEvent.upload(
    page.getByLabelText("Choose luminaire schedule PDF"),
    file,
  );
  await page.getByRole("button", { name: "Import PDF" }).click();
}

// Het fixture-boek als pad (relatief aan de projectroot): met de playwright-provider is
// een File-object uit fetch() niet betrouwbaar over de CDP-brug te uploaden, een pad wel.
const FIXTURE_BOEK = "./docs/examples/test-armaturenboek.pdf";

// Beeld-PDF ter plekke genereren (zelfde aanpak als lib/pdf/render.test.ts): elke
// pagina is één embedded JPEG — 0 tekens tekstlaag, precies het OCR-scenario. Klein
// genoeg (enkele kB) om als File-object over de CDP-brug te uploaden.
// Default 400×300 pt: dat valt boven de tiling-dpi-drempel (1568/400×72 ≈ 282
// dpi) en blijft dus één hele-pagina-beeld (tile 0) — de bestaande asserts op
// "Reading page x/y with OCR…" zonder tegel-suffix blijven daarmee geldig.
// A3 landscape (1191×842 pt) zakt onder de drempel en levert 12 tegels.
async function makeBeeldPdf(
  pageCount: number,
  size: [number, number] = [400, 300],
): Promise<File> {
  const [w, h] = size;
  const doc = await PDFDocument.create();
  for (let p = 1; p <= pageCount; p++) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("geen 2d-context");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Lp30${p} XAL SASSO ${p}00`, 40, 60);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const jpg = await doc.embedJpg(
      Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0)),
    );
    const pdfPage = doc.addPage([w, h]);
    pdfPage.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  const saved = await doc.save();
  return new File([saved.slice().buffer as ArrayBuffer], "beeldboek.pdf", {
    type: "application/pdf",
  });
}

// DOM-sampler voor de korte busy-fases (zelfde les als de trage-import-test):
// de voortgangsteksten wisselen sneller dan expect.element betrouwbaar pollt.
function startStatusSampler() {
  const samples: string[] = [];
  const timer = setInterval(() => {
    const status = document.querySelector('[role="status"]');
    if (status?.textContent) samples.push(status.textContent);
  }, 25);
  return { samples, stop: () => clearInterval(timer) };
}

test("beschadigde PDF → nette foutmelding client-side, kaart blijft bruikbaar", async () => {
  await renderServer(
    <Screen>
      <PdfUploadCard
        dossierId="d1"
        importAction={noopAction}
        startOcrAction={noopStartOcrAction}
        ocrPageAction={noopOcrPageAction}
        finishOcrAction={noopAction}
      />
    </Screen>,
  );
  const kapot = new File([new Uint8Array([1, 2, 3, 4])], "kapot.pdf", {
    type: "application/pdf",
  });
  await uploadEnVerstuur(kapot);
  // NB: page.getByRole("alert") is hier ambigu (Next' route-announcer is ook een alert)
  await expect
    .element(page.getByText(/could not be read/i))
    .toBeInTheDocument();
  // de flow stopte vóór de action: de action-fout ("Testfout") verscheen dus niet
  expect(document.body.textContent).not.toContain("Testfout");
  // knop weer vrij voor een nieuwe poging
  await expect
    .element(page.getByRole("button", { name: "Import PDF" }))
    .toBeEnabled();
});

// Tegelijk de regressietest voor het OCR-pad: dit fixture-boek HÉÉFT een tekstlaag,
// dus de kaart moet het bestaande import-pad nemen en de OCR-actions nooit aanraken
// (de stubs zouden dan een OCR-PAD-ONVERWACHT-marker tonen).
test("action antwoordt {error} → zichtbaar als alert; tekst-PDF raakt het OCR-pad niet", async () => {
  await renderServer(
    <Screen>
      <KaartMetErrorAction />
    </Screen>,
  );
  await uploadEnVerstuur(FIXTURE_BOEK);
  await expect
    .element(page.getByText("Testfout: import geweigerd."))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("OCR-PAD-ONVERWACHT");
  await expect
    .element(page.getByRole("button", { name: "Import PDF" }))
    .toBeEnabled();
});

test("tijdens extractie/import: busy-status zichtbaar en knop disabled", async () => {
  await renderServer(
    <Screen>
      <KaartMetTrageErrorAction />
    </Screen>,
  );
  // De busy-fase is kort (extractie + 800 ms trage action) — sneller dan de retry-
  // lus van expect.element betrouwbaar pollt. Daarom samplen we de DOM zelf elke
  // 25 ms rond de klik en toetsen we achteraf de waargenomen toestanden.
  const samples: { busy: string; disabled: boolean }[] = [];
  const sampler = setInterval(() => {
    const status = document.querySelector('[role="status"]');
    const input = document.querySelector(
      'input[name="pdf"]',
    ) as HTMLInputElement | null;
    samples.push({
      busy: status?.textContent ?? "",
      disabled: input?.disabled ?? false,
    });
  }, 25);
  try {
    await uploadEnVerstuur(FIXTURE_BOEK);
    // wachten tot de flow klaar is: fout van de action zichtbaar, kaart weer vrij
    await expect
      .element(page.getByText("Testfout: trage import geweigerd."))
      .toBeInTheDocument();
  } finally {
    clearInterval(sampler);
  }
  // tijdens de busy-fase: voortgangstekst mét paginateller én disabled input/knop
  const busySamples = samples.filter((s) => s.busy.length > 0);
  expect(busySamples.length).toBeGreaterThan(0);
  expect(busySamples.some((s) => /pages, importing/.test(s.busy))).toBe(true);
  expect(busySamples.every((s) => s.disabled)).toBe(true);
  // en na afloop weer vrij voor een nieuwe poging
  await expect
    .element(page.getByRole("button", { name: "Import PDF" }))
    .toBeEnabled();
});

// ── OCR-interactietests (plan-ocr-beeld-pdf, bouwstap 5) ─────────────────────
// Echte browser-extractie (0 tekens → OCR-pad) en échte rasterisatie (lib/pdf/render)
// tegen een ter plekke gegenereerde beeld-PDF; alleen de drie OCR-actions zijn
// client-side stubs (zelfde harness-beperking als hierboven).

test("beeld-PDF (0 tekst) → OCR-pad: voortgang per pagina zichtbaar, daarna afgerond", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrHappy />
    </Screen>,
  );
  const boek = await makeBeeldPdf(2);
  const { samples, stop } = startStatusSampler();
  try {
    await uploadEnVerstuur(boek);
    await expect
      .element(page.getByText("OCR finished — opening the results…"))
      .toBeInTheDocument();
  } finally {
    stop();
  }
  // Beide pagina's kwamen sequentieel langs in de voortgangstekst.
  expect(samples.some((s) => /Reading page 1\/2 with OCR/.test(s))).toBe(true);
  expect(samples.some((s) => /Reading page 2\/2 with OCR/.test(s))).toBe(true);
  // Niet het gewone import-pad, geen onverwachte OCR-fouten.
  expect(document.body.textContent).not.toContain("GEWONE-IMPORT-ONVERWACHT");
  expect(document.body.textContent).not.toContain("OCR-PAD-ONVERWACHT");
  // ⚠️ GEWIJZIGDE ASSERT (goal-liegende-import-melding) — bewust omgekeerd, niet
  // afgezwakt. Deze test verwachtte hier een wéér vrije knop, omdat de kaart na
  // een geslaagde OCR-run terugviel naar idle. Dat is precies de toestand die een
  // tweede, betaalde OCR-run uitnodigt terwijl de navigatie nog loopt. De kaart
  // blijft nu in 'handoff' op slot tot de projectpagina hem remount (key uit de
  // searchParams). Bij een FOUT gaat hij wél weer van slot — dat toetsen de
  // budget-stop- en fouttests hieronder onveranderd.
  await expect
    .element(page.getByRole("button", { name: "Import PDF" }))
    .toBeDisabled();
});

test("budget-stop halverwege → loop breekt af met melding hoeveel pagina's bleven liggen", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrBudgetStop />
    </Screen>,
  );
  const boek = await makeBeeldPdf(3);
  await uploadEnVerstuur(boek);
  await expect
    .element(page.getByText(/2 of 3 pages were not \(fully\) read/))
    .toBeInTheDocument();
  await expect
    .element(page.getByText(/€1 budget for this book is used up/))
    .toBeInTheDocument();
  // finish is bewust NIET aangeroepen (run staat serverside op 'gestopt').
  expect(document.body.textContent).not.toContain("OCR-PAD-ONVERWACHT");
  await expect
    .element(page.getByRole("button", { name: "Import PDF" }))
    .toBeEnabled();
});

test("hervatten (B5): donePages worden overgeslagen en de hervat-melding is zichtbaar", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrResume />
    </Screen>,
  );
  const boek = await makeBeeldPdf(3);
  const { samples, stop } = startStatusSampler();
  try {
    await uploadEnVerstuur(boek);
    await expect
      .element(page.getByText("OCR finished — opening the results…"))
      .toBeInTheDocument();
  } finally {
    stop();
  }
  // Alleen pagina 3 ging de deur uit (de stub geeft anders een HERVAT-FOUT-alert)…
  expect(document.body.textContent).not.toContain("HERVAT-FOUT");
  // …mét de eerlijke hervat-melding in de voortgang.
  expect(
    samples.some((s) =>
      /Resuming OCR from page 3 — Reading page 3\/3 with OCR/.test(s),
    ),
  ).toBe(true);
});

test("startOcrImportAction antwoordt {error} (geen key) → nette melding, niets gerenderd", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrStartError />
    </Screen>,
  );
  const boek = await makeBeeldPdf(1);
  await uploadEnVerstuur(boek);
  await expect
    .element(page.getByText(/OCR is unavailable: no AI key is configured/))
    .toBeInTheDocument();
  // De pagina-action is nooit aangeroepen (marker bleef uit) en de kaart is weer vrij.
  expect(document.body.textContent).not.toContain("OCR-PAD-ONVERWACHT");
  await expect
    .element(page.getByRole("button", { name: "Import PDF" }))
    .toBeEnabled();
});

// ── O4 (stap 5): tegel-interactietests — A3-pagina's gaan in 12 tegels ───────

test("A3-beeldpagina → 12 tegels sequentieel (rij-major), voortgang toont de tegel", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrTegels />
    </Screen>,
  );
  const boek = await makeBeeldPdf(1, [1191, 842]); // A3 landscape → 4×3 tegels
  const { samples, stop } = startStatusSampler();
  try {
    await uploadEnVerstuur(boek);
    await expect
      .element(page.getByText("OCR finished — opening the results…"))
      .toBeInTheDocument();
  } finally {
    stop();
  }
  // Alle 12 tegels, rij-major 1..12, elk precies één keer.
  expect(window.__verzondenTegels).toEqual(
    Array.from({ length: 12 }, (_, i) => `1:${i + 1}`),
  );
  // De voortgang benoemde de tegel ("(tile x/12)").
  expect(samples.some((s) => /\(tile \d+\/12\)/.test(s))).toBe(true);
});

test("hervatten met half getegelde pagina: alleen ontbrekende tegels gaan de deur uit", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrResumeHalveTegels />
    </Screen>,
  );
  const boek = await makeBeeldPdf(2, [1191, 842]);
  await uploadEnVerstuur(boek);
  await expect
    .element(page.getByText("OCR finished — opening the results…"))
    .toBeInTheDocument();
  // Geen al-gedane tegel opnieuw gestuurd…
  expect(document.body.textContent).not.toContain("HERVAT-FOUT");
  // …en precies de ontbrekende helft van pagina 2 (tegels 7–12) ging de deur uit.
  expect(window.__verzondenTegels).toEqual(
    Array.from({ length: 6 }, (_, i) => `2:${i + 7}`),
  );
});

test("budget-stop midden in een pagina → '(fully)' in de melding, finish niet aangeroepen", async () => {
  await renderServer(
    <Screen>
      <KaartMetOcrBudgetStopMidPagina />
    </Screen>,
  );
  const boek = await makeBeeldPdf(1, [1191, 842]);
  await uploadEnVerstuur(boek);
  await expect
    .element(page.getByText(/1 of 1 pages were not \(fully\) read/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("OCR-PAD-ONVERWACHT");
});

// Screenshot van de lopende OCR-voortgang (client-toestand; de RSC-toestand — het
// hervat-blok — zit in de screens-lus hierboven in alle vier de varianten).
test("OCR-voortgang: busy-toestand zichtbaar (screenshot)", async () => {
  await page.viewport(1280, 800);
  await renderServer(
    <Screen>
      <KaartMetOcrHangend />
    </Screen>,
  );
  const boek = await makeBeeldPdf(2);
  await uploadEnVerstuur(boek);
  // NB: de tekst staat óók op de disabled knop — het status-element is eenduidig.
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent(/Reading page 1\/2 with OCR/);
  await page.screenshot({
    path: "./project-ocr-progress.light.desktop.test.png",
  });
});

// Het controlespoor: inklapbaar blok met de brontekst + downloadknop naar de md-route.
test("importrun toont brontekst (markdown) met downloadknop", async () => {
  const { container } = await renderServer(<ImportRunScreen />);
  await expect
    .element(page.getByText("Source text (markdown)"))
    .toBeInTheDocument();
  await expect.element(page.getByText("## Pagina 1")).toBeInTheDocument();
  const link = container.querySelector('a[download]');
  expect(link?.getAttribute("href")).toBe("/projects/d1/import/r1/markdown");
});

// ── Redirect-terugkoppeling (goal-liegende-import-melding) ───────────────────
// Regressietests voor de bug waarbij een GESLAAGDE import zich als mislukking
// meldde: een action die redirect() doet laat zijn client-promise rejecten, en
// een lege catch verklaarde dat tot "Import failed — please try again."
//
// De negatieve assert `not.toContain("Import failed")` is de kern van deze hele
// fix. Verdwijnt hij ooit uit een succes-test, dan meet die test niets meer.

// De kaart mag geen alert tonen. NB via container, niet page.getByRole("alert"):
// Next' route-announcer is óók een alert (zie de test op regel 303).
function geenAlert(container: Element) {
  expect(container.querySelector('[role="alert"]')).toBeNull();
}

test("geslaagde import (action redirect) → eerlijke overdracht, géén 'Import failed'", async () => {
  const { container } = await renderServer(
    <Screen>
      <KaartMetRedirectendeImport />
    </Screen>,
  );
  await uploadEnVerstuur(FIXTURE_BOEK);
  await expect
    .element(page.getByText("Import complete — opening the results…"))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Import failed");
  geenAlert(container);
  // Het formulier blijft op slot tot de navigatie de kaart vervangt — anders
  // vuurt een ongeduldige gebruiker een tweede (betaalde) import af.
  const input = container.querySelector('input[name="pdf"]') as HTMLInputElement;
  expect(input.disabled).toBe(true);
});

test("geslaagde OCR-run (finish redirect) → afrondmelding i.p.v. 'Import failed'", async () => {
  const { container } = await renderServer(
    <Screen>
      <KaartMetRedirectendeFinishOcr />
    </Screen>,
  );
  await uploadEnVerstuur(await makeBeeldPdf(2));
  await expect
    .element(page.getByText("OCR finished — opening the results…"))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Import failed");
  geenAlert(container);
});

test("OCR met gefaalde pagina's → de telling is eindelijk zichtbaar", async () => {
  const { container } = await renderServer(
    <Screen>
      <KaartMetOcrGefaaldePaginas />
    </Screen>,
  );
  await uploadEnVerstuur(await makeBeeldPdf(3));
  // Deze regel stond vóór deze fix achter een setDone() die in productie nooit
  // werd bereikt — de gebruiker kreeg alleen "Import failed" te zien.
  await expect
    .element(page.getByText(/OCR finished — 2 of 3 pages failed/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Import failed");
  geenAlert(container);
});

test("sessie verlopen (redirect naar /login) → sessie-melding, nooit 'finished'", async () => {
  await renderServer(
    <Screen>
      <KaartMetSessieRedirect />
    </Screen>,
  );
  await uploadEnVerstuur(await makeBeeldPdf(2));
  await expect
    .element(page.getByText(/Your session expired/))
    .toBeInTheDocument();
  // /login is óók een NEXT_REDIRECT — maar géén succes. Er mag hier dus geen
  // afrondmelding en al helemaal geen verzonnen faaltelling staan.
  expect(document.body.textContent).not.toContain("OCR finished");
  expect(document.body.textContent).not.toContain("pages failed");
  expect(document.body.textContent).not.toContain("Import failed");
  // Wél de eerlijke raad: hervatten kost niets extra, opnieuw uploaden wel.
  await expect.element(page.getByText(/resume/)).toBeInTheDocument();
});

test("redirect naar een onverwachte bestemming → falen, niet stil (default-deny)", async () => {
  const { container } = await renderServer(
    <Screen>
      <KaartMetOnverwachteBestemming />
    </Screen>,
  );
  await uploadEnVerstuur(FIXTURE_BOEK);
  await expect
    .element(page.getByText(/unexpected page/))
    .toBeInTheDocument();
  // de bestemming staat erbij — een stille onbekende accepteren we niet meer
  expect(container.textContent).toContain("/data/brands");
  expect(document.body.textContent).not.toContain("Import complete");
});

test("notFound() uit een action blijft een zichtbare fout", async () => {
  await renderServer(
    <Screen>
      <KaartMetNotFound />
    </Screen>,
  );
  await uploadEnVerstuur(FIXTURE_BOEK);
  await expect
    .element(page.getByText(/refused the request \(404\)/))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Import complete");
});

test("crash midden in de OCR-lus → zichtbare fout mét oorzaak", async () => {
  await renderServer(
    <Screen>
      <KaartMetCrashInLoop />
    </Screen>,
  );
  await uploadEnVerstuur(await makeBeeldPdf(3));
  await expect.element(page.getByText(/canvas kapot/)).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Import complete");
});

// NEGATIEVE CONTROLE. Deze test moet vóór én ná de fix groen zijn: hij assert
// alleen invarianten (er ís een fout zichtbaar, met oorzaak, en de kaart staat
// niet in een succestoestand) en niet op de nieuwe formulering. Zou hij mee rood
// worden, dan bewijst hij niets meer over het feit dat de fix niets heeft
// dichtgeplakt.
test("negatieve controle: een echte netwerkfout blijft zichtbaar", async () => {
  const { container } = await renderServer(
    <Screen>
      <KaartMetNetwerkfout />
    </Screen>,
  );
  await uploadEnVerstuur(FIXTURE_BOEK);
  await vi.waitFor(
    () => {
      const alert = container.querySelector('[role="alert"]');
      if (!alert?.textContent?.trim()) throw new Error("nog geen foutmelding");
    },
    { timeout: 15_000, interval: 100 },
  );
  // geen succes-/voortgangstoestand blijven hangen
  expect(container.querySelector('[role="status"]')).toBeNull();
});

// Dit deel is wél nieuw gedrag (en dus rood vóór de fix): de onderliggende
// oorzaak moet mee de UI in. Zonder detail zijn een netwerkfout, een 500 en
// "an unexpected response was received" niet van elkaar te onderscheiden en is
// de melding weer een dooddoener.
test("netwerkfout benoemt de oorzaak in plaats van een dooddoener", async () => {
  const { container } = await renderServer(
    <Screen>
      <KaartMetNetwerkfout />
    </Screen>,
  );
  await uploadEnVerstuur(FIXTURE_BOEK);
  await expect
    .element(page.getByText(/Failed to fetch/))
    .toBeInTheDocument();
  expect(container.textContent).not.toContain("please try again");
});

// ── Screenshots van de nieuwe toestanden ─────────────────────────────────────
// Deze kunnen niet in de screens-lus hierboven: ze bestaan pas ná een upload.
// De stubs rejecten wél maar navigeren niet (de testomgeving heeft geen router),
// dus de toestand staat stil en de opname is stabiel.
//
// project-import-error is de eerste screenshot in dit project met een
// text-destructive-alert erin — het donkere contrast van een foutmelding was
// nooit eerder bekeken. Slagen en falen moeten naast elkaar te leggen zijn: dat
// is het hele punt van deze fix.
const interactieSchermen = {
  "project-import-handoff": {
    ui: <KaartMetRedirectendeImport />,
    klaar: "Import complete — opening the results…",
  },
  "project-import-error": {
    ui: <KaartMetNetwerkfout />,
    klaar: /The import did not complete/,
  },
} as const;

for (const [name, { ui, klaar }] of Object.entries(interactieSchermen)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(<Screen>{ui}</Screen>);
        await uploadEnVerstuur(FIXTURE_BOEK);
        await expect.element(page.getByText(klaar)).toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// De faaltelling apart (het OCR-pad heeft een gegenereerde beeld-PDF nodig).
// Eén opname, naar het model van de bestaande project-ocr-progress-test.
test("project-ocr-done-failures (light, desktop)", async () => {
  await page.viewport(1280, 800);
  await renderServer(
    <Screen>
      <KaartMetOcrGefaaldePaginas />
    </Screen>,
  );
  await uploadEnVerstuur(await makeBeeldPdf(3));
  await expect
    .element(page.getByText(/OCR finished — 2 of 3 pages failed/))
    .toBeInTheDocument();
  await page.screenshot({
    path: "./project-ocr-done-failures.light.desktop.test.png",
  });
});
