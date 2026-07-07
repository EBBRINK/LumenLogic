// White-box RSC-render/screenshottests van de review-wachtrij met fixture-data
// (klein, deterministisch). Licht/donker × mobiel/desktop, plus expliciete asserts op de
// koppen, de beslis-knoppen en het verplichte redenveld bij afwijzen.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { ReviewQueue } from "./review-queue";
import type { ReviewItem } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const pending: ReviewItem[] = [
  {
    id: "s1",
    fixtureCode: "Lp301",
    brandText: "XAL",
    productText: "SASSO 100",
    status: "geel",
    reviewKind: "geel",
    deviations: [
      {
        field: "Kelvin",
        requested: 2700,
        delivered: 3000,
        verdict: "geel",
        note: "300K koeler dan gevraagd",
      },
    ],
    reqColor: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewDecision: null,
  },
  {
    id: "s2",
    fixtureCode: "Lw201",
    brandText: "Wever & Ducré",
    productText: "SCAVA 1.0",
    status: "groen",
    reviewKind: "variant",
    deviations: null,
    reqColor: "zwart",
    reviewedAt: null,
    reviewedBy: null,
    reviewDecision: null,
  },
];

const done: ReviewItem[] = [
  {
    id: "s3",
    fixtureCode: "Ls001",
    brandText: "Glamox",
    productText: "i40",
    status: "geel",
    reviewKind: "geel",
    deviations: null,
    reqColor: null,
    reviewedAt: "03-07-2026",
    reviewedBy: "eduard@brinklicht.nl",
    reviewDecision: "accepteer",
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

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`review-queue (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <ReviewQueue
            dossierId="d1"
            pending={pending}
            done={done}
            decideAction={noopAction}
          />
        </Screen>,
      );
      await expect.element(document.body).toBeInTheDocument();
      await page.screenshot({ path: `./review-queue.${theme}.${device}.test.png` });
    });
  }
}

test("review-queue toont koppen, acties en (bij afwijzen) een verplicht redenveld", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={pending}
        done={done}
        decideAction={noopAction}
      />
    </Screen>,
  );
  // Titel telt wachtend + afgerond.
  await expect
    .element(page.getByText(/2 wachtend, 1 afgerond/))
    .toBeInTheDocument();
  // Gele kaart: accepteren + afwijzen.
  await expect
    .element(page.getByRole("button", { name: /Accepteer als voorstel/ }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: /Wijs af/ }))
    .toBeInTheDocument();
  // Variantkaart: kleur bevestigen.
  await expect
    .element(page.getByRole("button", { name: /Bevestig kleur/ }))
    .toBeInTheDocument();
  // Afwijzen toont een (verplicht) redenveld.
  await expect
    .element(page.getByText(/Reden \(verplicht/))
    .toBeInTheDocument();
  // Afgerond item draagt het audit-spoor (wie).
  await expect
    .element(page.getByText(/eduard@brinklicht\.nl/))
    .toBeInTheDocument();
});

test("review-queue lege staat", async () => {
  await renderServer(
    <Screen>
      <ReviewQueue dossierId="d1" pending={[]} done={[]} decideAction={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Niets te reviewen/))
    .toBeInTheDocument();
});
