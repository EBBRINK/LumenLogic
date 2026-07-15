// White-box RSC-render/screenshottests van de armaturenboek-versiehistorie met fixture-
// data (klein, deterministisch). Licht/donker × mobiel/desktop, plus expliciete asserts op
// de snapshot-knop, de diff, de locatie (G-03) en de datasheet-links (G-04).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { VersionHistory } from "./version-history";
import type {
  VersionDiffView,
  VersionListItem,
  VersionSnapshotLine,
} from "./version-history";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const versions: VersionListItem[] = [
  {
    id: "v2",
    version: 2,
    note: "na revisie klant",
    actor: "eduard@brinklicht.nl",
    createdAt: "05-07-2026",
    lineCount: 3,
    compareHref: "?from=v1&to=v2",
  },
  {
    id: "v1",
    version: 1,
    note: "eerste overdracht",
    actor: "timo@brinklicht.nl",
    createdAt: "01-07-2026",
    lineCount: 2,
    compareHref: null,
  },
];

const latestLines: VersionSnapshotLine[] = [
  {
    fixtureCode: "Lp301",
    location: "Begane grond — entree",
    brand: "XAL",
    productId: "p1",
    productName: "SASSO 100 SQ SP CEIL 17,9W",
    articleCode: "L360-SASSO100",
    kelvin: 2700,
    cri: 90,
    ip: "IP20",
    status: "groen",
    datasheets: [{ filename: "sasso-100.pdf", url: "https://x/sasso-100.pdf" }],
  },
  {
    fixtureCode: "Ls001",
    location: "1e verdieping — gang",
    brand: "Glamox",
    productId: null,
    productName: null,
    articleCode: null,
    kelvin: null,
    cri: null,
    ip: null,
    status: "rood",
  },
];

const diff: VersionDiffView = {
  fromVersion: 1,
  toVersion: 2,
  added: [
    {
      fixtureCode: "Lx900",
      location: "Dak",
      brand: "Bega",
      productId: null,
      productName: null,
      articleCode: null,
      kelvin: null,
      cri: null,
      ip: null,
      status: "blauw",
    },
  ],
  removed: [
    {
      fixtureCode: "Lw201",
      location: "2e verdieping",
      brand: "Wever & Ducré",
      productId: null,
      productName: null,
      articleCode: null,
      kelvin: null,
      cri: null,
      ip: null,
      status: "geel",
    },
  ],
  changed: [
    { fixtureCode: "Lp301", location: "Begane grond — entree", fields: ["location", "productName"] },
  ],
  unchanged: 1,
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`version-history (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <VersionHistory
            dossierId="d1"
            versions={versions}
            latest={{ version: 2, lines: latestLines }}
            diff={diff}
            snapshotAction={noopAction}
          />
        </Screen>,
      );
      await expect.element(document.body).toBeInTheDocument();
      await page.screenshot({
        path: `./version-history.${theme}.${device}.test.png`,
      });
    });
  }
}

test("version-history toont snapshot-knop, versienummers, diff, locatie en datasheets", async () => {
  await renderServer(
    <Screen>
      <VersionHistory
        dossierId="d1"
        versions={versions}
        latest={{ version: 2, lines: latestLines }}
        diff={diff}
        snapshotAction={noopAction}
      />
    </Screen>,
  );
  // Snapshot-knop.
  await expect
    .element(page.getByRole("button", { name: /Save new version/ }))
    .toBeInTheDocument();
  // Diff-kop v1 → v2.
  await expect
    .element(page.getByText(/Changes v1 → v2/))
    .toBeInTheDocument();
  // Gewijzigde, toegevoegde en verwijderde regels benoemd.
  await expect.element(page.getByText("Lp301").first()).toBeInTheDocument();
  await expect.element(page.getByText("Lx900")).toBeInTheDocument();
  await expect.element(page.getByText("Lw201")).toBeInTheDocument();
  // Locatie (G-03) staat in de nieuwste-versie-tabel.
  await expect
    .element(page.getByText("Begane grond — entree").first())
    .toBeInTheDocument();
  // Datasheet-link (G-04).
  await expect
    .element(page.getByRole("link", { name: "sasso-100.pdf" }))
    .toBeInTheDocument();
});

test("version-history lege staat nodigt uit tot een eerste versie", async () => {
  await renderServer(
    <Screen>
      <VersionHistory
        dossierId="d1"
        versions={[]}
        latest={null}
        diff={null}
        snapshotAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/No versions saved yet/))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: /Save new version/ }))
    .toBeInTheDocument();
});
