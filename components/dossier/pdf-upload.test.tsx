// White-box RSC-screenshottests voor stap 5: de projectpagina met de PDF-upload als
// éérste blok boven de regeltabel, en de importrun-pagina met het inklapbare
// markdown-controlespoor + downloadknop. Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
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
      <PdfUploadCard dossierId="d1" importAction={noopAction} />
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
    ready: "Brontekst (markdown)",
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
    .element(page.getByText("Armaturenboek uploaden (PDF)"))
    .toBeInTheDocument();
  const upload = container.querySelector('input[type="file"][name="pdf"]');
  const tabel = container.querySelector("table");
  expect(upload).toBeTruthy();
  expect(tabel).toBeTruthy();
  // DOCUMENT_POSITION_FOLLOWING (4): de tabel komt ná de upload-input.
  expect(upload!.compareDocumentPosition(tabel!) & 4).toBe(4);
  // korte uitleg staat erbij
  await expect
    .element(page.getByText(/regels worden automatisch gematcht/i))
    .toBeInTheDocument();
});

// Het controlespoor: inklapbaar blok met de brontekst + downloadknop naar de md-route.
test("importrun toont brontekst (markdown) met downloadknop", async () => {
  const { container } = await renderServer(<ImportRunScreen />);
  await expect
    .element(page.getByText("Brontekst (markdown)"))
    .toBeInTheDocument();
  await expect.element(page.getByText("## Pagina 1")).toBeInTheDocument();
  const link = container.querySelector('a[download]');
  expect(link?.getAttribute("href")).toBe("/projects/d1/import/r1/markdown");
});
