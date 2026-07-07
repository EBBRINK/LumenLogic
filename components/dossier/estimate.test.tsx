// White-box RSC-tests van de estimate-tab (§3.8). Fixture-gedreven, klein en
// deterministisch. Kernchecks (ijzeren regels): groen/geel/samen kloppen, blauw/rood/
// paars staan als p.m. en tellen NOOIT mee in het totaal, een regel zonder aantal wordt
// p/st, en de aanvraag-/zonevolgorde blijft intact. Plus licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { QuoteView } from "./quote-view";
import type { EstimateHeader, EstimateLine } from "./quote-view";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const header: EstimateHeader = {
  quoteNumber: null, // nog niet uitgestuurd → "BL-2026-{nummer volgt}"
  quoteDate: "2026-07-07",
  customer: "Deerns",
  projectRef: "PRJ-42",
  author: "hello@noplasticfloralfoam.com",
  validUntil: "2026-08-07",
};

// Gegroepeerd per zone, alle vijf de statussen, plus één groene regel zónder aantal.
const zonedLines: EstimateLine[] = [
  // Zone A-08
  {
    id: "l1", fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12,
    productName: "SASSO 100 SQ SP CEIL 2700K", sku: "L360-SASSO100",
    unitPrice: "310.00", brandText: "XAL", productText: "SASSO 100",
  },
  {
    id: "l2", fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8,
    productName: "SCAVA WALL SURF 1.0 3000K", sku: "L092-SCAVA",
    unitPrice: "226.00", brandText: "Wever & Ducré", productText: "SCAVA 1.0",
    deviations: [
      { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
    ],
  },
  {
    id: "l3", fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5,
    productName: null, sku: null, unitPrice: null, brandText: "Kreon", productText: "Prologe 80",
  },
  // Zone B-02
  {
    id: "l4", fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3,
    productName: null, sku: null, unitPrice: null, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)",
  },
  {
    // paars mét prijs én aantal → zou 2×500=1000 zijn als het (fout) mee zou tellen.
    id: "l5", fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2,
    productName: "Wandcontactdoos wit", sku: "WCD-01", unitPrice: "500.00",
    brandText: null, productText: "WCD",
  },
  {
    // groene regel zónder aantal → p/st i.p.v. regeltotaal, telt niet mee.
    id: "l6", fixtureCode: "Lp302", zone: "B-02", status: "groen", quantity: null,
    productName: "SASSO 60 2700K", sku: "L360-SASSO60", unitPrice: "100.00",
    brandText: "XAL", productText: "SASSO 60",
  },
];

// Zonder zones → één lijst.
const flatLines: EstimateLine[] = [
  {
    id: "f1", fixtureCode: "A1", zone: null, status: "groen", quantity: 10,
    productName: "Prod A", sku: "SKU-A", unitPrice: "50.00", brandText: "XAL", productText: "A",
  },
  {
    id: "f2", fixtureCode: "A2", zone: null, status: "geel", quantity: 4,
    productName: "Prod B", sku: "SKU-B", unitPrice: "25.00", brandText: "XAL", productText: "B",
  },
  {
    id: "f3", fixtureCode: "A3", zone: null, status: "blauw", quantity: 2,
    productName: null, sku: null, unitPrice: null, brandText: "Kreon", productText: "C",
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const screens = {
  "estimate-zones": (
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        phase="tender"
        header={header}
        lines={zonedLines}
        actions={
          <button type="button" className="rounded border px-2 py-1 text-sm">
            Print / PDF
          </button>
        }
      />
    </Screen>
  ),
  "estimate-flat": (
    <Screen>
      <QuoteView
        dossierName="Kantoor Zuid"
        phase="awarded"
        header={{ ...header, quoteNumber: "BL-2026-0042" }}
        lines={flatLines}
      />
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect.element(document.body).toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// ── Functionele checks (kern) ────────────────────────────────────────────────
test("totalen: groen + geel apart, samen = groen + geel", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  // groen 12×310 = 3.720,00 ; geel 8×226 = 1.808,00 ; samen = 5.528,00
  await expect.element(page.getByText(/3\.720,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/1\.808,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/5\.528,00/).first()).toBeInTheDocument();
  await expect.element(page.getByText("Samen (groen + geel)")).toBeInTheDocument();
});

test("blauw/rood/paars: p.m., NOOIT in het totaal opgeteld", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("p.m.").first()).toBeInTheDocument();
  // paars (2×500) mag NERGENS als regeltotaal (1.000,00) verschijnen…
  expect(page.getByText(/1\.000,00/).query()).toBeNull();
  // …en het samen-totaal blijft 5.528,00, niet 6.528,00 (5528 + paars 1000).
  expect(page.getByText(/6\.528,00/).query()).toBeNull();
  // de niet-opgeteld-regel benoemt de aantallen expliciet.
  await expect.element(page.getByText(/blauw 1/)).toBeInTheDocument();
  await expect.element(page.getByText(/rood 1/)).toBeInTheDocument();
  await expect.element(page.getByText(/paars 1/)).toBeInTheDocument();
});

test("regel zonder aantal → p/st i.p.v. regeltotaal", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("p/st")).toBeInTheDocument();
});

test("zones: gegroepeerd met zone-koppen, aanvraagvolgorde behouden", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText("Zone A-08")).toBeInTheDocument();
  await expect.element(page.getByText("Zone B-02")).toBeInTheDocument();
});

test("open punten & acties: blauw = inladen (ons), rood = terug naar klant", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText(/inladen/).first()).toBeInTheDocument();
  await expect.element(page.getByText(/terug naar\s+klant/)).toBeInTheDocument();
  // merken-inladen-lijst met frequentie (blauw-merk Kreon 1×).
  await expect.element(page.getByText(/Kreon — 1×/)).toBeInTheDocument();
});

test("kopblok: nummer-volgt fallback als er nog geen offertenummer is", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Ziekenhuis Noord" phase="tender" header={header} lines={zonedLines} />
    </Screen>,
  );
  await expect.element(page.getByText(/BL-2026-\{nummer volgt\}/)).toBeInTheDocument();
});

test("zonder zones → één lijst, geen zone-koppen", async () => {
  await renderServer(
    <Screen>
      <QuoteView dossierName="Kantoor Zuid" phase="awarded" header={header} lines={flatLines} />
    </Screen>,
  );
  // groen 10×50 = 500,00 ; geel 4×25 = 100,00 ; samen = 600,00
  await expect.element(page.getByText(/600,00/).first()).toBeInTheDocument();
  expect(page.getByText(/^Zone\b/).query()).toBeNull();
});
