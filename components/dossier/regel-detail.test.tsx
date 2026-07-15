// White-box RSC-tests van het regel-detailscherm (§3.6): de kandidaten-kant
// (MatchCandidates, twee lijsten + afronding) en de transparantietabel (DeviationTable).
// Fixture-data, klein en deterministisch; licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DeviationTable } from "./deviation-table";
import { MatchCandidates, type RegelCandidate } from "./match-candidates";
import type { Deviation } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const provable: RegelCandidate[] = [
  {
    id: "p1",
    name: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K",
    brandName: "XAL",
    articleCode: "L360-SASSO100",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: 2700,
    cri: 90,
    ipValue: "IP20",
    lumenOutput: 1200,
    grossPrice: "310.00",
    matchKind: "fuzzy",
    list: "aantoonbaar",
    chosen: true,
    deviations: [
      { field: "kelvin", requested: 2700, delivered: 2700, verdict: "groen" },
    ],
  },
  {
    id: "p2",
    name: "SASSO 100 RD SP CEIL 25W LED 3000K",
    brandName: "XAL",
    articleCode: "L360-SASSO100-RD",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Spots",
    kelvin: 3000,
    cri: 90,
    ipValue: "IP20",
    lumenOutput: 1800,
    grossPrice: "345.00",
    matchKind: "fuzzy",
    list: "aantoonbaar",
    deviations: [],
  },
];

const incomplete: RegelCandidate[] = [
  {
    id: "p3",
    name: "SCAVA WALL SURF 1.0 LED 3000K",
    brandName: "Wever & Ducré",
    articleCode: "L092-SCAVA",
    supplierArticleCode: null,
    categoryPath: "Binnen >> Wand",
    kelvin: 3000,
    cri: null,
    ipValue: null,
    lumenOutput: null,
    grossPrice: "226.00",
    matchKind: "fuzzy",
    list: "onvolledig",
    deviations: [
      { field: "cri", requested: 90, delivered: null, verdict: "onbekend" },
      { field: "ip", requested: "IP44", delivered: null, verdict: "onbekend" },
    ],
  },
];

const deviations: Deviation[] = [
  { field: "kelvin", requested: 2700, delivered: 2700, verdict: "groen", note: "exact" },
  { field: "straalhoek", requested: 12, delivered: 13, verdict: "geel", note: "1° breder" },
  { field: "ip", requested: "IP44", delivered: null, verdict: "onbekend" },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const candidatesScreen = (
  <Screen>
    <h3 className="mb-3 text-sm font-medium">Kandidaten</h3>
    <MatchCandidates
      dossierId="d1"
      specLine={{
        id: "s1",
        fixtureCode: "Lp301",
        brandText: "XAL",
        productText: "SASSO 100",
      }}
      provable={provable}
      incomplete={incomplete}
      chooseAction={noopAction}
      setLineStatusAction={noopAction}
      setDayPriceAction={noopAction}
      runMatchAction={noopAction}
    />
  </Screen>
);

const deviationScreen = (
  <Screen>
    <h3 className="mb-3 text-sm font-medium">Afwijkingen</h3>
    <DeviationTable deviations={deviations} />
  </Screen>
);

// ── Screenshots (licht/donker × mobiel/desktop) ──────────────────────────────
const screens = {
  "regel-kandidaten": candidatesScreen,
  "regel-afwijkingen": deviationScreen,
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

// ── Inhoudelijke asserts ─────────────────────────────────────────────────────
// NB: page.getByText matcht standaard case-insensitive/substring (Playwright). Voor de
// knoppen gebruiken we getByRole zodat de kop "…zet op inlaadlijst" niet meebotst; voor
// koppen exact:true.
test("MatchCandidates: beide lijsten met hun kop verschijnen", async () => {
  await renderServer(candidatesScreen);
  await expect
    .element(page.getByText("Provably compliant", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Possible — data incomplete", { exact: true }))
    .toBeInTheDocument();
});

test("MatchCandidates: prijzen worden getoond (nooit gesorteerd)", async () => {
  await renderServer(candidatesScreen);
  // Regel 2: prijs is zichtbaar op elke kandidaat.
  await expect.element(page.getByText("310,00")).toBeInTheDocument();
  await expect.element(page.getByText("345,00")).toBeInTheDocument();
  await expect.element(page.getByText("226,00")).toBeInTheDocument();
});

test("MatchCandidates: onvolledige kandidaat toont 'geen data' per onbekend veld", async () => {
  await renderServer(candidatesScreen);
  await expect.element(page.getByText("cri: no data")).toBeInTheDocument();
  await expect.element(page.getByText("ip: no data")).toBeInTheDocument();
});

test("MatchCandidates: afrondings-knoppen (rood/blauw/paars) + dagprijs aanwezig", async () => {
  await renderServer(candidatesScreen);
  await expect
    .element(page.getByRole("button", { name: "Set to Red" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Add to load list" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Set to Purple" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Spot price on this line", { exact: true }))
    .toBeInTheDocument();
});

test("MatchCandidates: zonder kandidaten verschijnt de 'draai de matcher'-knop", async () => {
  await renderServer(
    <Screen>
      <MatchCandidates
        dossierId="d1"
        specLine={{
          id: "s1",
          fixtureCode: "Lp301",
          brandText: "XAL",
          productText: "SASSO 100",
        }}
        provable={[]}
        incomplete={[]}
        chooseAction={noopAction}
        setLineStatusAction={noopAction}
        setDayPriceAction={noopAction}
        runMatchAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: "Run the matcher" }))
    .toBeInTheDocument();
});

test("DeviationTable: kolommen + een afwijking (gevraagd 12, geleverd 13) zichtbaar", async () => {
  await renderServer(deviationScreen);
  await expect
    .element(page.getByText("Requested", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Delivered", { exact: true }))
    .toBeInTheDocument();
  // De afwijking straalhoek: gevraagd 12, geleverd 13.
  await expect.element(page.getByText("12", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByText("13", { exact: true })).toBeInTheDocument();
  // Onbekend veld = eerlijke grijze vlag "geen data", nooit stil weggelaten.
  await expect.element(page.getByText("no data", { exact: true }).first()).toBeInTheDocument();
});

test("DeviationTable: leeg → eerlijke uitleg i.p.v. niets", async () => {
  await renderServer(
    <Screen>
      <DeviationTable deviations={[]} />
    </Screen>,
  );
  await expect
    .element(page.getByText("No deviations recorded yet", { exact: false }))
    .toBeInTheDocument();
});
