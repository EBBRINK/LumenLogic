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

// UX-audit 30 jul (bug #8): de Details-kolom drukte ruwe JSON af. Nu een sleutel/waarde-
// lijst met leesbare labels — de assert pint bewust béide kanten: het paar staat er, de
// accolades staan er niet meer.
test("events: payload staat als sleutel/waarde-lijst, niet als ruwe JSON", async () => {
  await renderServer(
    <Screen>
      <EventsBlock events={events} />
    </Screen>,
  );
  await expect.element(page.getByText("Status:")).toBeInTheDocument();
  await expect.element(page.getByText("rood")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain('{"status"');
});

// UX-audit 30 jul (bug #8): de kern van de fix is de FALLBACK. `ocr_page_done` staat niet
// als handgeschreven label in de map — zonder eventLabel() lekte de ruwe sleutel als pil
// op het scherm. Deze test gebruikt daarom expres een actie die NIET in ACTION_LABEL staat.
test("events: een onbekende actie lekt niet ruw maar wordt een zin", async () => {
  await renderServer(
    <Screen>
      <EventsBlock
        events={[
          {
            id: "e9",
            entity: "import_run",
            action: "iets_geheel_nieuws",
            actor: "systeem",
            createdAt: "2026-07-06T09:00:00Z",
            payload: null,
          },
          // En een sleutel die met een afkorting begint: "Ocr page ..." zou fout staan.
          {
            id: "e10",
            entity: "import_run",
            action: "ocr_iets_nieuws",
            actor: "systeem",
            createdAt: "2026-07-06T09:01:00Z",
            payload: null,
          },
        ]}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Iets geheel nieuws")).toBeInTheDocument();
  await expect.element(page.getByText("OCR iets nieuws")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("iets_geheel_nieuws");
  expect(document.body.textContent).not.toContain("ocr_iets_nieuws");
});

// UX-audit 30 jul (bug #9): het log droeg zijn eigen nl-NL-formatter zónder jaar
// ("6 jul, 11:00") terwijl het log over maanden loopt. Eén formatter, mét jaar.
test("events: het moment draagt een jaartal en is Engels", async () => {
  await renderServer(
    <Screen>
      <EventsBlock events={events} />
    </Screen>,
  );
  await expect
    .element(page.getByText("06 Jul 2026, 11:00"))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("jul,");
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
