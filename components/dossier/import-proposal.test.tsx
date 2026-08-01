// White-box RSC-render van het import-voorstelscherm met fixtures. Twee bronnen: een OCR-
// import (waarschuwing "check every line", regels standaard uitgevinkt) en een CSV-plak
// (rustige banner, regels standaard aangevinkt). Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { ImportProposal } from "./import-proposal";
import type { ImportRow } from "@/db/schema";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const ocrRows: ImportRow[] = [
  {
    fixtureCode: "Lp301", quantity: 12, brandText: "XAL", productText: "SASSO 100",
    zone: "Entree", specs: { kelvin: 2700, cri: 90, ip: "IP20" },
    source: "ocr", page: 1, checked: false,
  },
  {
    fixtureCode: "Lw201", quantity: 8, brandText: "Wever & Ducré", productText: "SCAVA 1.0",
    specs: { kelvin: 3000 }, source: "ocr", page: 2, checked: false,
  },
  {
    fixtureCode: "Lx999", quantity: null, brandText: "??", productText: "onleesbaar",
    source: "ocr", page: 2, checked: false,
  },
];

const csvRows: ImportRow[] = [
  { fixtureCode: "A1", quantity: 4, brandText: "Glamox", productText: "i40", source: "csv", checked: true },
  { fixtureCode: "A2", quantity: 6, brandText: "iGuzzini", productText: "Laser Blade", source: "csv", checked: true },
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
  "import-ocr": (
    <Screen>
      <ImportProposal
        dossierId="d1"
        runId="r1"
        source="ocr"
        confidence="middel"
        filename="armaturenboek.pdf"
        rows={ocrRows}
        confirmAction={noopAction}
        cancelAction={noopAction}
      />
    </Screen>
  ),
  "import-csv": (
    <Screen>
      <ImportProposal
        dossierId="d2"
        runId="r2"
        source="csv"
        confidence="hoog"
        rows={csvRows}
        confirmAction={noopAction}
        cancelAction={noopAction}
      />
    </Screen>
  ),
} as const;

// Ankerassertie per scherm — iets uit de gerenderde ImportProposal zelf, niet uit de
// <Screen>-wrapper hierboven. `expect.element` retryt en wacht dus de RSC-stream af.
// Zonder dit anker was `expect.element(document.body)` de enige assertie in deze acht
// tests, en die blijft groen als de component niets rendert.
const anchors: Record<keyof typeof screens, string | RegExp> = {
  "import-ocr": "onleesbaar", // productText van de onzekere derde OCR-rij
  "import-csv": "Laser Blade", // productText van de tweede CSV-rij
};

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await expect
          .element(page.getByText(anchors[name as keyof typeof screens]).first())
          .toBeInTheDocument();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

test("OCR-import: waarschuwt om elke regel te controleren", async () => {
  await renderServer(
    <Screen>
      <ImportProposal
        dossierId="d1" runId="r1" source="ocr" confidence="middel"
        rows={ocrRows} confirmAction={noopAction} cancelAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/check every line/i))
    .toBeInTheDocument();
  // elke herkende rij staat op het scherm (niets wordt stilzwijgend weggelaten)
  await expect.element(page.getByText("Lp301")).toBeInTheDocument();
  await expect.element(page.getByText("Lx999")).toBeInTheDocument();
});

test("OCR-rijen staan standaard UIT (checkbox niet aangevinkt)", async () => {
  const { container } = await renderServer(
    <Screen>
      <ImportProposal
        dossierId="d1" runId="r1" source="ocr"
        rows={ocrRows} confirmAction={noopAction} cancelAction={noopAction}
      />
    </Screen>,
  );
  // 0 aangevinkt → de bevestig-knop noemt 0 regels (wacht ook op de RSC-stream)
  await expect
    .element(page.getByRole("button", { name: /Add 0 checked lines/i }))
    .toBeInTheDocument();
  const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect(boxes.length).toBe(ocrRows.length);
  for (const box of boxes) expect(box.checked).toBe(false);
});

test("CSV-plak: rustige banner (geen OCR-waarschuwing), rijen standaard AAN", async () => {
  const { container } = await renderServer(
    <Screen>
      <ImportProposal
        dossierId="d2" runId="r2" source="csv" confidence="hoog"
        rows={csvRows} confirmAction={noopAction} cancelAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: /Add 2 checked lines/i }))
    .toBeInTheDocument();
  expect(page.getByText(/check every line/i).query()).toBeNull();
  const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect(boxes.length).toBe(csvRows.length);
  for (const box of boxes) expect(box.checked).toBe(true);
});

test("de annuleer-knop is aanwezig — niets opgeslagen tot bevestigen", async () => {
  await renderServer(
    <Screen>
      <ImportProposal
        dossierId="d1" runId="r1" source="csv"
        rows={csvRows} confirmAction={noopAction} cancelAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByRole("button", { name: /Cancel import/i }))
    .toBeInTheDocument();
});
