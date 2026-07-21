// White-box render-tests van de data-werkbank-schermen met fixture-data (licht/donker ×
// mobiel/desktop). Minimaal: assert op zichtbare tekst/structuur; screenshots als bonus.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { CoverageMeter } from "./coverage-meter";
import {
  BrandPicker,
  EnrichmentRunsTable,
  SampleReview,
  type EnrichBrand,
  type EnrichRunRow,
  type SampleItem,
} from "./enrichment-panels";
import { BrandLoadQueue, type QueueRow } from "./brand-load-queue";
import {
  PriceListStatusTable,
  type PriceListRow,
} from "./price-list-status";
import { EvaluationPanel, type EvalLine, type EvalRunRow } from "./evaluation-panel";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const brands: EnrichBrand[] = [
  { id: "b1", name: "Delta Light", productCount: 42, enriched: 10 },
  { id: "b2", name: "XAL", productCount: 18, enriched: 0 },
];

const runs: EnrichRunRow[] = [
  {
    id: "r1",
    brandName: "Delta Light",
    status: "gepubliceerd",
    counts: { producten: 42, geparsed: 61, steekproef: 20, toegepast: 55 },
    sampleErrorRate: "0.0500",
    createdAt: "2026-07-01T10:00:00Z",
  },
  {
    id: "r2",
    brandName: "XAL",
    status: "steekproef",
    counts: { producten: 18, geparsed: 24, steekproef: 8 },
    sampleErrorRate: null,
    createdAt: "2026-07-05T12:00:00Z",
  },
];

const sampleItems: SampleItem[] = [
  { id: "i1", productName: "SASSO 100 17,9W 3000K", field: "kelvin", value: "3000", sampleVerdict: "goed" },
  { id: "i2", productName: "SASSO 100 17,9W 3000K", field: "maxWattage", value: "17.9", sampleVerdict: null },
  { id: "i3", productName: "SPY 39 IP54 CRI90", field: "cri", value: "90", sampleVerdict: "fout" },
];

const queue: QueueRow[] = [
  { id: "q1", displayName: "Occhio", frequency: 5, status: "wachtend", loadedAt: null },
  { id: "q2", displayName: "Flos", frequency: 2, status: "ingeladen", loadedAt: "2026-07-02T09:00:00Z" },
];

const priceLists: PriceListRow[] = [
  { id: "pl1", name: "Prijslijst Occhio", brandName: "Occhio", validUntil: "2026-06-01", productCount: 30, daysLeft: -36, bucket: "verlopen" },
  { id: "pl2", name: "Prijslijst XAL", brandName: "XAL", validUntil: "2026-07-10", productCount: 18, daysLeft: 3, bucket: "7" },
  { id: "pl3", name: "Prijslijst Delta", brandName: "Delta Light", validUntil: "2027-01-01", productCount: 42, daysLeft: 178, bucket: "ok" },
];

const evalLines: EvalLine[] = [
  { id: "e1", fixtureCode: "EV-A", brandText: "XAL", productText: "SASSO 100", expectedStatus: "groen" },
  { id: "e2", fixtureCode: "EV-B", brandText: "Occhio", productText: "Mito", expectedStatus: "blauw" },
];

const evalRuns: EvalRunRow[] = [
  {
    id: "run1",
    label: "baseline",
    hitRate: "0.5000",
    results: [
      { lineId: "e1", expected: "groen", got: "groen", hit: true },
      { lineId: "e2", expected: "blauw", got: "rood", hit: false },
    ],
    createdAt: "2026-07-03T08:00:00Z",
  },
  {
    id: "run2",
    label: "na tweak",
    hitRate: "1.0000",
    results: [
      { lineId: "e1", expected: "groen", got: "groen", hit: true },
      { lineId: "e2", expected: "blauw", got: "blauw", hit: true },
    ],
    createdAt: "2026-07-06T08:00:00Z",
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const screens = {
  "data-overzicht": (
    <Screen>
      <CoverageMeter total={120} covered={78} ratio={0.65} />
      <div className="mt-6">
        <BrandPicker brands={brands} startAction={noopAction} />
        <EnrichmentRunsTable runs={runs} />
      </div>
    </Screen>
  ),
  "verrijking-steekproef": (
    <Screen>
      <SampleReview
        runId="r2"
        status="steekproef"
        items={sampleItems}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>
  ),
  inladen: (
    <Screen>
      <BrandLoadQueue rows={queue} markLoadedAction={noopAction} />
    </Screen>
  ),
  prijslijsten: (
    <Screen>
      <PriceListStatusTable rows={priceLists} />
    </Screen>
  ),
  evaluatie: (
    <Screen>
      <EvaluationPanel lines={evalLines} runs={evalRuns} measureAction={noopAction} />
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
        await page.screenshot({ path: `./data-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

test("dekkingsmeter toont het percentage en de telling", async () => {
  await renderServer(
    <Screen>
      <CoverageMeter total={120} covered={78} ratio={0.65} />
    </Screen>,
  );
  await expect.element(page.getByText("65%")).toBeInTheDocument();
  await expect
    .element(page.getByText(/78 of 120 products/))
    .toBeInTheDocument();
});

// De steekproefpoort (20 jul): zolang één rij geen oordeel heeft weigert publishRun, dus de
// UI zegt dat en zet de knop uit — beter dan de gebruiker tegen een servererror laten lopen.
// sampleItems bevat bewust één onbeoordeelde rij (i2) én één 'fout' (i3); de openstaande
// review wint, want die blokkeert.
test("steekproef met onbeoordeelde rij: publiceren geblokkeerd", async () => {
  await renderServer(
    <Screen>
      <SampleReview
        runId="r2"
        status="steekproef"
        items={sampleItems}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/1 sample row\(s\) still need a verdict/))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Publish" }))
    .toBeDisabled();
});

test("steekproef volledig beoordeeld: publiceren mag, mét fout-waarschuwing", async () => {
  const beoordeeld: SampleItem[] = sampleItems.map((it) =>
    it.sampleVerdict == null ? { ...it, sampleVerdict: "goed" as const } : it,
  );
  await renderServer(
    <Screen>
      <SampleReview
        runId="r2"
        status="steekproef"
        items={beoordeeld}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: "Publish" }))
    .toBeEnabled();
  await expect
    .element(page.getByText(/1 item\(s\) marked incorrect/))
    .toBeInTheDocument();
});

test("gepubliceerde run toont geen goed/fout-knoppen meer", async () => {
  await renderServer(
    <Screen>
      <SampleReview
        runId="r1"
        status="gepubliceerd"
        items={sampleItems}
        verdictAction={noopAction}
        publishAction={noopAction}
        rejectAction={noopAction}
      />
    </Screen>,
  );
  expect(page.getByRole("button", { name: "Publish" }).query()).toBeNull();
});

test("evaluatie toont de laatste score en per-regel-diff", async () => {
  await renderServer(
    <Screen>
      <EvaluationPanel lines={evalLines} runs={evalRuns} measureAction={noopAction} />
    </Screen>,
  );
  // laatste run = "na tweak" met 100% (verschijnt in de scorekaart én de historie-tabel)
  await expect.element(page.getByText("100%").first()).toBeInTheDocument();
  await expect.element(page.getByText("hit").first()).toBeInTheDocument();
});
