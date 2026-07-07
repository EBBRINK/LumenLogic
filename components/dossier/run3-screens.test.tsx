// Screenshot-tests voor run 2/3-schermen: werkvoorbereider (gelijkwaardigheidsengine),
// armaturenboek (projectleider) en analytics (Fase-2-fundament). Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { AnalyticsView } from "@/components/analytics-view";
import { ArmaturenboekView } from "./armaturenboek-view";
import { WerkvoorbereiderView } from "./werkvoorbereider-view";
import type { WerkvoorbereiderLine } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const merkOpgave = "merk-opgave";
const wvLines: WerkvoorbereiderLine[] = [
  {
    specLineId: "s1", fixtureCode: "Lp301", quantity: 12,
    referenceName: "SASSO 100 SQ SP CEIL 3000K", referenceBrand: "XAL",
    alternatives: [
      {
        id: "a1", name: "Esprit ceiling CRI90 3000K", brandName: "Kreon",
        articleCode: "KR-ESP", kelvin: 3000, grossPrice: "699.00",
        equivalenceScore: 3, rationale: "Gelijkwaardig spot 3000K — beter op garantie, levensduur (epd)",
        technical: [
          { label: "Kleurtemperatuur", reference: "3000", candidate: "3000", verdict: "equal", source: merkOpgave },
          { label: "CRI", reference: null, candidate: "90", verdict: "unknown", source: merkOpgave },
          { label: "IP-waarde", reference: "IP20", candidate: "IP20", verdict: "equal", source: merkOpgave },
        ],
        sustainability: [
          { label: "Garantie", reference: "36 mnd", candidate: "120 mnd", verdict: "better", source: merkOpgave },
          { label: "Repareerbaarheid", reference: "C", candidate: "A", verdict: "unknown", source: merkOpgave },
          { label: "Levensduur (EPD)", reference: "35000 u", candidate: "100000 u", verdict: "better", source: merkOpgave },
          { label: "Herkomst", reference: "Oostenrijk", candidate: "België", verdict: "unknown", source: merkOpgave },
        ],
      },
    ],
  },
];

const armatuurRows = [
  { fixtureCode: "Lp301", quantity: 12, brand: "XAL", productName: "SASSO 100 SQ SP CEIL 3000K", articleCode: "L360048-33100111S", kelvin: 3000, cri: null, ip: null, status: "groen" as const },
  { fixtureCode: "Lw201", quantity: 8, brand: "Wever & Ducré", productName: "SCAVA WALL SURF 1.0", articleCode: "L092W350188W3", kelvin: null, cri: 90, ip: null, status: "geel" as const },
  { fixtureCode: "Ls001", quantity: 4, brand: null, productName: null, articleCode: null, kelvin: null, cri: null, ip: null, status: "rood" as const },
];

const analytics = {
  totalEvents: 33,
  actionCounts: [
    { action: "search", count: 17 }, { action: "match", count: 5 },
    { action: "suggestions", count: 4 }, { action: "quote_generated", count: 3 },
    { action: "dossier_created", count: 2 }, { action: "no_match", count: 2 },
  ],
  topSearches: [
    { query: "SASSO 100", count: 5 }, { query: "INFINITE PRO", count: 3 },
    { query: "SCAVA 1.0", count: 3 },
  ],
  topMatched: [
    { brand: "XAL", name: "SASSO 100 SQ SP CEIL 3000K", count: 2 },
    { brand: "Wever & Ducré", name: "SCAVA WALL SURF 1.0", count: 1 },
  ],
  recent: [
    { action: "match", entity: "spec_line", actor: "hello@brink", createdAt: "", payload: { productId: "x" } },
    { action: "search", entity: "spec_line", actor: "hello@brink", createdAt: "", payload: { query: "SASSO 100" } },
  ],
};

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>;
}

afterEach(() => document.documentElement.classList.remove("dark"));

const screens = {
  werkvoorbereiding: (
    <Screen>
      <WerkvoorbereiderView dossierName="Deerns armaturenboek (demo)" lines={wvLines} />
    </Screen>
  ),
  armaturenboek: (
    <Screen>
      <ArmaturenboekView dossierName="Deerns armaturenboek (demo)" customer="Deerns" rows={armatuurRows} />
    </Screen>
  ),
  analytics: (
    <Screen>
      <AnalyticsView data={analytics} />
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
