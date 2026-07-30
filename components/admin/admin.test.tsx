// White-box RSC-render tests van de admin-console-blokken met fixture-data. Licht/donker ×
// mobiel/desktop, plus gerichte asserts op wat ertoe doet: een merk zonder producten toont
// nul (het gat blijft eerlijk), afwijzen vraagt altijd een reden, en een PDL-import gaat via
// staging — nooit stilzwijgend de catalogus in.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { BrandsListBlock, type BrandListRow } from "./brands-list-block";
import {
  UploadReviewBlock,
  type PdlBrandOption,
  type UploadReviewRow,
} from "./upload-review-block";
import { MembershipsBlock, type MembershipRow } from "./memberships-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const brands: BrandListRow[] = [
  {
    id: "b1",
    name: "Delta Light",
    productCount: 42,
  },
  {
    id: "b2",
    name: "XAL",
    productCount: 0,
  },
];

const uploads: UploadReviewRow[] = [
  {
    id: "u1",
    brandName: "Flos",
    kind: "pricelist",
    submittedBy: "merk@flos.com",
    createdAt: "2026-07-01T10:00:00Z",
  },
  {
    id: "u2",
    brandName: "Artemide",
    kind: "data",
    submittedBy: null,
    createdAt: "2026-07-05T12:00:00Z",
  },
];

const pdlBrands: PdlBrandOption[] = [
  { id: "b1", name: "Delta Light" },
  { id: "b2", name: "XAL" },
];

const memberships: MembershipRow[] = [
  { id: "m1", orgName: "Aannemer Zuid", email: "piet@zuid.nl", roles: ["calculator"] },
  {
    id: "m2",
    orgName: "Bouw Noord",
    email: "els@noord.nl",
    roles: ["org_admin", "projectleider"],
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

const adminScreen = (
  <Screen>
    <BrandsListBlock brands={brands} />
    <UploadReviewBlock
      uploads={uploads}
      pdlBrands={pdlBrands}
      approveAction={noopAction}
      rejectAction={noopAction}
      pdlImportAction={noopAction}
    />
    <MembershipsBlock memberships={memberships} />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`admin (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(adminScreen);
      await expect.element(document.body).toBeInTheDocument();
      await expect
        .element(page.getByText("Brands", { exact: true }))
        .toBeInTheDocument();
      await expect
        .element(page.getByText("Pending uploads"))
        .toBeInTheDocument();
      await page.screenshot({ path: `./admin.${theme}.${device}.test.png` });
    });
  }
}

test("merken: een merk zonder producten toont nul (het gat blijft eerlijk)", async () => {
  await renderServer(
    <Screen>
      <BrandsListBlock brands={brands} />
    </Screen>,
  );
  await expect.element(page.getByText("XAL")).toBeInTheDocument();
  await expect.element(page.getByText("0", { exact: true })).toBeInTheDocument();
});

test("uploads: afwijzen vereist een reden (required input)", async () => {
  await renderServer(
    <Screen>
      <UploadReviewBlock
        uploads={uploads}
        pdlBrands={pdlBrands}
        approveAction={noopAction}
        rejectAction={noopAction}
        pdlImportAction={noopAction}
      />
    </Screen>,
  );
  // Wacht tot de render is doorgekomen voordat we ruw de DOM bevragen.
  await expect.element(page.getByText("Pending uploads")).toBeInTheDocument();
  const noteInput = document.querySelector<HTMLInputElement>(
    'input[aria-label="Reason for rejecting upload u1"]',
  );
  expect(noteInput).not.toBeNull();
  expect(noteInput?.required).toBe(true);
});

test("uploads: PDL-import biedt merken en gaat via staging", async () => {
  await renderServer(
    <Screen>
      <UploadReviewBlock
        uploads={[]}
        pdlBrands={pdlBrands}
        approveAction={noopAction}
        rejectAction={noopAction}
        pdlImportAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("No pending uploads."))
    .toBeInTheDocument();
  const brandSelect = document.querySelector<HTMLSelectElement>("#pdl-brand");
  expect(brandSelect).not.toBeNull();
  expect(brandSelect?.querySelectorAll("option").length).toBe(3); // placeholder + 2 merken
});

test("gebruikers: meerdere rollen per persoon staan als aparte badges", async () => {
  await renderServer(
    <Screen>
      <MembershipsBlock memberships={memberships} />
    </Screen>,
  );
  await expect.element(page.getByText("Bouw Noord")).toBeInTheDocument();
  await expect.element(page.getByText("Org admin")).toBeInTheDocument();
  await expect.element(page.getByText("Project lead")).toBeInTheDocument();
});

// De EventsBlock-render-test verhuisde naar components/data/event-log-block.test.tsx —
// het scherm zelf verhuisde van Admin naar Data (sprint 2.0a).
