// White-box RSC-render/screenshottest voor de matchstation-kaart (sprint M1). Twee
// representatieve standen — nog niet aangeboden (met de knop) en wachtend (status,
// geen knop) — elk licht/donker × mobiel/desktop, zelfde harnas als
// components/dossier/project-status.test.tsx.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { MatchstationCard } from "./matchstation-card";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const screens = {
  "matchstation-niet-aangeboden": (
    <Screen>
      <MatchstationCard dossierId="d1" entry={null} enqueueAction={noopAction} />
    </Screen>
  ),
  "matchstation-wachtend": (
    <Screen>
      <MatchstationCard
        dossierId="d1"
        entry={{
          status: "wachtend",
          enqueuedAt: new Date("2026-08-13T09:00:00Z"),
          leaseUntil: null,
          resultReceivedAt: null,
        }}
        enqueueAction={noopAction}
      />
    </Screen>
  ),
} as const;

const anchors: Record<keyof typeof screens, () => Promise<unknown>> = {
  "matchstation-niet-aangeboden": () =>
    expect
      .element(page.getByRole("button", { name: "Ready for matching" }))
      .toBeInTheDocument(),
  "matchstation-wachtend": () =>
    expect
      .element(page.getByText("Queued for the matchstation", { exact: false }))
      .toBeInTheDocument(),
};

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(ui);
        await anchors[name as keyof typeof screens]();
        await page.screenshot({ path: `./${name}.${theme}.${device}.test.png` });
      });
    }
  }
}

test("verwerkt: toont het tijdstip en biedt 'Send again' aan", async () => {
  await renderServer(
    <Screen>
      <MatchstationCard
        dossierId="d1"
        entry={{
          status: "verwerkt",
          enqueuedAt: new Date("2026-08-13T09:00:00Z"),
          leaseUntil: null,
          resultReceivedAt: new Date("2026-08-13T09:20:00Z"),
        }}
        enqueueAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("Processed by the matchstation", { exact: false }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Send again" }))
    .toBeInTheDocument();
});

test("geclaimd: toont de lease, geen knop", async () => {
  await renderServer(
    <Screen>
      <MatchstationCard
        dossierId="d1"
        entry={{
          status: "geclaimd",
          enqueuedAt: new Date("2026-08-13T09:00:00Z"),
          leaseUntil: new Date("2026-08-13T09:15:00Z"),
          resultReceivedAt: null,
        }}
        enqueueAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("Claimed by the matchstation", { exact: false }))
    .toBeInTheDocument();
  await expect.element(page.getByRole("button")).not.toBeInTheDocument();
});
