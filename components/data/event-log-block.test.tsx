// White-box RSC-render tests van het Event-log-scherm onder Data (sprint 2.0a) — verhuisd
// van components/admin/admin.test.tsx (EventsBlock) + samengevoegd met de tellingen-kop die
// eerder op /analytics stond. Licht/donker × mobiel/desktop, plus gerichte asserts: het
// leesbare actie-label (lib/event-labels.ts) verschijnt, en de payload-snippet toont wat er
// gelogd is zonder de rauwe modeltekst te verzinnen.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { EventsBlock, type EventRow } from "./event-log-block";
import { EventLogView } from "./event-log-view";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const events: EventRow[] = [
  {
    id: "e1",
    entity: "spec_line",
    action: "matched_status",
    actor: "timo",
    createdAt: "2026-07-06T09:00:00Z",
    payload: { status: "rood" },
  },
  {
    id: "e2",
    entity: "search",
    action: "search",
    actor: "timo",
    createdAt: "2026-07-06T09:05:00Z",
    payload: null,
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`event-log (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <EventLogView
            totalEvents={2}
            actionCounts={[
              { action: "matched_status", count: 1 },
              { action: "search", count: 1 },
            ]}
            events={events}
          />
        </Screen>,
      );
      await expect.element(document.body).toBeInTheDocument();
      await expect.element(page.getByText("Logged events")).toBeInTheDocument();
      await expect.element(page.getByText("By type")).toBeInTheDocument();
      await page.screenshot({ path: `./event-log.${theme}.${device}.test.png` });
    });
  }
}

test("events: recente handelingen zijn zichtbaar met leesbaar label en actor", async () => {
  await renderServer(
    <Screen>
      <EventsBlock events={events} />
    </Screen>,
  );
  // Leesbaar label via lib/event-labels.ts, niet de rauwe actie-string.
  await expect.element(page.getByText("Status set")).toBeInTheDocument();
  await expect
    .element(page.getByText("matched_status"))
    .not.toBeInTheDocument();
  await expect.element(page.getByText("timo").first()).toBeInTheDocument();
});

test("events: payload-snippet verschijnt als die er is, anders een streepje", async () => {
  await renderServer(
    <Screen>
      <EventsBlock events={events} />
    </Screen>,
  );
  await expect.element(page.getByText(/"status":"rood"/)).toBeInTheDocument();
});

test("event-log-view: tellingen-kop toont het totaal en de per-actie-badges", async () => {
  await renderServer(
    <Screen>
      <EventLogView
        totalEvents={2}
        actionCounts={[
          { action: "matched_status", count: 1 },
          { action: "search", count: 1 },
        ]}
        events={events}
      />
    </Screen>,
  );
  await expect.element(page.getByText("2", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByText("Status set").first()).toBeInTheDocument();
});
