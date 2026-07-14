// White-box RSC-screenshottests van de kernschermen met fixture-data (klein,
// deterministisch). Licht/donker × mobiel/desktop — dit is het "zicht" op de UI.
//
// NB: het regel-detailscherm (MatchCandidates, twee kandidatenlijsten + afronding) wordt
// getest in regel-detail.test.tsx; de estimate/offerte in estimate.test.tsx. De
// fase-poort van ijzeren regel 4 (tender toont géén alternatieven-suggesties) leeft op
// repo-niveau en wordt getest in lib/repo/rules.test.ts. Hier houden we de twee schermen
// die nergens anders in beeld komen: de dossierlijst en de spec-regeltabel.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { DossierList } from "./dossier-list";
import { SpecLineTable } from "./spec-line-table";
import { emptyCounts } from "./status";
import type { DossierSummary, SpecLineRow } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const dossiers: DossierSummary[] = [
  {
    id: "d1",
    name: "Ziekenhuis Noord",
    customer: "Deerns",
    phase: "tender",
    status: "concept",
    counts: { ...emptyCounts(), groen: 9, geel: 2, blauw: 2, rood: 1 },
  },
  {
    id: "d2",
    name: "Kantoor Zuid",
    customer: "BAM Bouw",
    phase: "awarded",
    status: "gegund",
    counts: { ...emptyCounts(), groen: 4, paars: 1 },
  },
];

const specLines: SpecLineRow[] = [
  {
    id: "s1", fixtureCode: "Lp301", quantity: 12, brandText: "XAL",
    productText: "SASSO 100", reqKelvin: 2700, reqCri: 90, reqIp: "IP20",
    status: "groen", matchedProductId: "p1",
    matchedName: "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K", matchedBrand: "XAL",
    matchedArticleCode: "L360-SASSO100", matchedPrice: "310.00",
  },
  {
    id: "s2", fixtureCode: "Lw201", quantity: 8, brandText: "Wever & Ducré",
    productText: "SCAVA 1.0", reqKelvin: 3000, reqCri: 90, reqIp: null,
    status: "geel", matchedProductId: "p2",
    matchedName: "SCAVA WALL SURF 1.0 LED 3000K", matchedBrand: "Wever & Ducré",
    matchedArticleCode: "L092-SCAVA", matchedPrice: "226.00",
    deviations: [
      { field: "straalhoek", requested: 12, delivered: 13, verdict: "geel", note: "1° breder" },
    ],
  },
  {
    id: "s3", fixtureCode: "Ls001", quantity: null, brandText: "Glamox",
    productText: "i40", reqKelvin: null, reqCri: null, reqIp: null,
    status: "rood", matchedProductId: null, matchedName: null,
    matchedBrand: null, matchedArticleCode: null, matchedPrice: null,
  },
];

// B3 (geel auto-door): een regel waarvan de bijna-match automatisch is geaccepteerd
// (chosenBy='system:auto') — het label hoort onder de afwijkingsnotitie te staan.
const autoDoorLines: SpecLineRow[] = [
  specLines[1], // gewone gele review-regel zónder label, als contrast
  {
    id: "s4", fixtureCode: "Lk410", quantity: 6, brandText: "XAL",
    productText: "VELA ROUND", reqKelvin: 3000, reqCri: null, reqIp: null,
    status: "geel", matchedProductId: "p4",
    matchedName: "VELA ROUND 600 opbouw 3000K", matchedBrand: "XAL",
    matchedArticleCode: "L450-VELA600", matchedPrice: "412.00",
    chosenBy: "system:auto",
    deviations: [
      { field: "watt", requested: 12, delivered: 14, verdict: "geel", note: "gevraagd 12, geleverd 14" },
    ],
  },
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
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Projecten</h1>
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
  "regel-auto-door": (
    <Screen>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        Ziekenhuis Noord
      </h1>
      <SpecLineTable dossierId="d1" lines={autoDoorLines} deleteAction={noopAction} />
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

// De dossierlijst toont per dossier de kleuren-telling (E-03) — een status-dashboard in
// het klein. Niets telt op tot iets misleidends; het is puur de telling per status.
test("DossierList: toont de kleuren-telling wanneer counts zijn meegestuurd", async () => {
  await renderServer(
    <Screen>
      <DossierList dossiers={dossiers} />
    </Screen>,
  );
  await expect.element(page.getByText("Ziekenhuis Noord")).toBeInTheDocument();
  // groen=9 uit d1 verschijnt als telling.
  await expect.element(page.getByText("9", { exact: true })).toBeInTheDocument();
});

// B3: het label "automatisch geaccepteerde bijna-match" staat alléén op de regel met
// chosenBy='system:auto' — de gewone gele review-regel ernaast blijft label-loos.
test("SpecLineTable: auto-door-label alleen op de system:auto-regel", async () => {
  await renderServer(
    <Screen>
      <SpecLineTable dossierId="d1" lines={autoDoorLines} deleteAction={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText("automatisch geaccepteerde bijna-match"))
    .toBeInTheDocument();
  // de afwijkingsnotitie van de auto-regel staat er ook (label vervangt de notitie niet)
  await expect.element(page.getByText("gevraagd 12, geleverd 14")).toBeInTheDocument();
});

test("SpecLineTable: regel zonder system:auto-keuze draagt het label NIET", async () => {
  await renderServer(
    <Screen>
      <SpecLineTable dossierId="d1" lines={specLines} deleteAction={noopAction} />
    </Screen>,
  );
  expect(page.getByText("automatisch geaccepteerde bijna-match").query()).toBeNull();
});

// Niets stilzwijgend weglaten: ook de rode regel zonder match staat er, met status.
test("SpecLineTable: rode regel zonder match blijft zichtbaar met status", async () => {
  await renderServer(
    <Screen>
      <SpecLineTable dossierId="d1" lines={specLines} deleteAction={noopAction} />
    </Screen>,
  );
  await expect.element(page.getByText("Ls001", { exact: true })).toBeInTheDocument();
  // Ontbrekend aantal = eerlijke "p/st"-markering, nooit stil weggelaten.
  await expect.element(page.getByText("p/st", { exact: true })).toBeInTheDocument();
});

// Stap 7 (herontwerp 2026-07-14): een door een méns gekozen match (review-keuze,
// kandidaat of handmatige link) draagt het merkteken "handmatig gekozen" — en dat
// staat nooit op regels zonder menskeuze of met system:auto.
test("SpecLineTable: merkteken 'handmatig gekozen' alleen bij een niet-system chosenBy", async () => {
  const manualLines: SpecLineRow[] = [
    specLines[0], // groen zonder chosenBy → geen merkteken
    {
      ...specLines[1],
      id: "s5",
      status: "groen",
      chosenBy: "eduard@brinklicht.nl",
    },
  ];
  await renderServer(
    <Screen>
      <SpecLineTable dossierId="d1" lines={manualLines} deleteAction={noopAction} />
    </Screen>,
  );
  const labels = page.getByText("handmatig gekozen");
  await expect.element(labels).toBeInTheDocument();
  expect(labels.elements().length).toBe(1); // alléén de menskeuze-regel
  expect(page.getByText("automatisch geaccepteerde bijna-match").query()).toBeNull();
});
