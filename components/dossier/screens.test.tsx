// White-box RSC-screenshottests van de calculatorflow-schermen met fixture-data
// (klein, deterministisch). Licht/donker × mobiel/desktop — dit is het "zicht" op de UI.
// Bevat ook de UI-kant van ijzeren regel 4: tender toont géén suggesties, gegund wél.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DossierList } from "./dossier-list";
import { MatchCandidates } from "./match-candidates";
import { QuoteView } from "./quote-view";
import { SpecLineTable } from "./spec-line-table";
import type { Candidate, DossierSummary, SpecLineRow, QuoteLineRow } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const dossiers: DossierSummary[] = [
  { id: "d1", name: "Ziekenhuis Noord", customer: "Deerns", phase: "tender" },
  { id: "d2", name: "Kantoor Zuid", customer: "BAM Bouw", phase: "awarded" },
];

const specLines: SpecLineRow[] = [
  {
    id: "s1", fixtureCode: "Lp301", quantity: 12, brandText: "XAL",
    productText: "SASSO 100", reqKelvin: 2700, reqCri: 90, reqIp: "IP20",
    status: "matched", matchedProductId: "p1",
    matchedName: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K", matchedBrand: "XAL",
    matchedArticleCode: "L360-SASSO100", matchedPrice: "310.00",
  },
  {
    id: "s2", fixtureCode: "Lw201", quantity: 8, brandText: "Wever & Ducré",
    productText: "SCAVA 1.0", reqKelvin: 3000, reqCri: 90, reqIp: null,
    status: "matched", matchedProductId: "p2",
    matchedName: "SCAVA WALL SURF 1.0 LED 3000K", matchedBrand: "Wever & Ducré",
    matchedArticleCode: "L092-SCAVA", matchedPrice: "226.00",
  },
  {
    id: "s3", fixtureCode: "Ls001", quantity: 4, brandText: "Glamox",
    productText: "i40", reqKelvin: null, reqCri: null, reqIp: null,
    status: "no_match", matchedProductId: null, matchedName: null,
    matchedBrand: null, matchedArticleCode: null, matchedPrice: null,
  },
];

const candidates: Candidate[] = [
  {
    id: "p1", name: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K 220-240V",
    brandName: "XAL", articleCode: "L360048-2191", supplierArticleCode: null,
    categoryPath: "Binnen >> Spots", kelvin: 2700, cri: 90, ipValue: "IP20",
    lumenOutput: 1200, grossPrice: "310.00", matchKind: "fuzzy",
  },
  {
    id: "p2", name: "SASSO 100 RD SP CEIL 25W LED 3000K 220-240V",
    brandName: "XAL", articleCode: "L360048-2192", supplierArticleCode: null,
    categoryPath: "Binnen >> Spots", kelvin: 3000, cri: 90, ipValue: "IP20",
    lumenOutput: 1800, grossPrice: "345.00", matchKind: "fuzzy",
  },
];

const quoteLines: QuoteLineRow[] = [
  { id: "q1", fixtureCode: "Lp301", productName: "SASSO 100 SQ SP CEIL 2700K", quantity: 12, unitPrice: "310.00", lineTotal: "3720.00" },
  { id: "q2", fixtureCode: "Lw201", productName: "SCAVA WALL SURF 1.0 3000K", quantity: 8, unitPrice: "226.00", lineTotal: "1808.00" },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const screens = {
  dossiers: (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Dossiers</h1>
      <DossierList dossiers={dossiers} />
    </Screen>
  ),
  "spec-regels": (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        Ziekenhuis Noord
      </h1>
      <SpecLineTable dossierId="d1" lines={specLines} deleteAction={noopAction} />
    </Screen>
  ),
  "match-tender": (
    <Screen>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">
        Match voor Lp301 — tender
      </h1>
      <MatchCandidates
        dossierId="d1"
        specLine={{ id: "s1", fixtureCode: "Lp301", brandText: "XAL", productText: "SASSO 100" }}
        candidates={candidates}
        phase="tender"
        matchAction={noopAction}
        noMatchAction={noopAction}
      />
    </Screen>
  ),
  offerte: (
    <Screen>
      <QuoteView
        dossierName="Ziekenhuis Noord"
        customer="Deerns"
        phase="tender"
        lines={quoteLines}
        total={5528}
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

test("regel 4 (UI): tender-match toont GEEN suggesties, ook niet met data", async () => {
  await renderServer(
    <Screen>
      <MatchCandidates
        dossierId="d1"
        specLine={{ id: "s1", fixtureCode: "Lp301", brandText: "XAL", productText: "SASSO 100" }}
        candidates={candidates}
        phase="tender"
        suggestions={candidates}
        matchAction={noopAction}
        noMatchAction={noopAction}
      />
    </Screen>,
  );
  // in tender bestaat de suggesties-sectie niet, zelfs niet als er suggesties meegegeven zijn
  expect(page.getByTestId("suggestions").query()).toBeNull();
});

test("regel 4 (UI): gegund-match toont de suggesties-sectie wél", async () => {
  await renderServer(
    <Screen>
      <MatchCandidates
        dossierId="d2"
        specLine={{ id: "s1", fixtureCode: "Lp301", brandText: "XAL", productText: "SASSO 100" }}
        candidates={candidates}
        phase="awarded"
        suggestions={candidates}
        matchAction={noopAction}
        noMatchAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByTestId("suggestions")).toBeInTheDocument();
});
