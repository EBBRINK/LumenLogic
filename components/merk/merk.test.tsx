// Render-tests van de merkportaal-schermen met fixture-data (klein, deterministisch).
// Licht/donker × mobiel/desktop is het "zicht"; daarnaast een paar gedrags-asserts op de
// ijzeren grenzen: geen prijs/ranking in de data-weergave, staging-status zichtbaar bij
// uploads, en alleen geaggregeerde tellingen op het dashboard.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { BrandOverview } from "./brand-overview";
import { BrandDataView, type BrandProductRow } from "./brand-data-view";
import { PricelistUpload, type UploadRow } from "./pricelist-upload";
import { BrandDashboard } from "./brand-dashboard";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const productRows: BrandProductRow[] = [
  {
    id: "p1", name: "SASSO 100 CEIL", articleCode: "L360-SASSO100",
    kelvin: 2700, cri: 90, ipValue: "IP20", lumenOutput: 1200, status: "actief",
  },
  {
    id: "p2", name: "SCAVA WALL 1.0", articleCode: null,
    kelvin: 3000, cri: null, ipValue: null, lumenOutput: null, status: "actief",
  },
];

const uploads: UploadRow[] = [
  {
    id: "u1", kind: "pricelist", status: "staging", validUntil: "2027-12-31",
    submittedBy: "merk@xal.com", createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "u2", kind: "pricelist", status: "approved", validUntil: "2026-12-31",
    submittedBy: "merk@xal.com", createdAt: "2026-05-01T10:00:00.000Z",
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
  overzicht: (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Merkportaal</h1>
      <BrandOverview brandName="XAL" />
    </Screen>
  ),
  data: (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Data inzien</h1>
      <BrandDataView brandName="XAL" products={productRows} />
    </Screen>
  ),
  prijslijsten: (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Prijslijsten</h1>
      <PricelistUpload
        brandId="b1"
        brandName="XAL"
        uploads={uploads}
        submitAction={noopAction}
      />
    </Screen>
  ),
  dashboard: (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <BrandDashboard
        brandName="XAL"
        data={{ considered: 12, chosen: 5 }}
        refreshAction={noopAction}
      />
    </Screen>
  ),
} as const;

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`merk-${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect.element(document.body).toBeInTheDocument();
        await page.screenshot({ path: `./brand-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

// Data-weergave: geen prijs en geen ranking — puur techniek. Ontbrekende specs = grijze
// vlag ("—"), nooit stilzwijgend weggelaten.
test("BrandDataView: toont specs zonder prijs; ontbrekende data als vlag", async () => {
  await renderServer(
    <Screen>
      <BrandDataView brandName="XAL" products={productRows} />
    </Screen>,
  );
  await expect.element(page.getByText("SASSO 100 CEIL")).toBeInTheDocument();
  // Geen prijskolom.
  await expect.element(page.getByText("Price", { exact: true })).not.toBeInTheDocument();
  // Ontbrekende CRI bij het tweede product verschijnt als grijze vlag.
  await expect.element(page.getByText("—").first()).toBeInTheDocument();
});

// H-11: een aangeleverde prijslijst is zichtbaar met zijn status (staging = in afwachting).
test("PricelistUpload: toont aangeleverde uploads met status", async () => {
  await renderServer(
    <Screen>
      <PricelistUpload
        brandId="b1"
        brandName="XAL"
        uploads={uploads}
        submitAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Awaiting review")).toBeInTheDocument();
  await expect.element(page.getByText("Approved")).toBeInTheDocument();
});

// K-05: het dashboard toont geaggregeerde tellingen (overwogen/gekozen), geen projecten.
test("BrandDashboard: toont geaggregeerde tellingen", async () => {
  await renderServer(
    <Screen>
      <BrandDashboard
        brandName="XAL"
        data={{ considered: 12, chosen: 5 }}
        refreshAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Considered")).toBeInTheDocument();
  await expect.element(page.getByText("12", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByText("Chosen")).toBeInTheDocument();
});
