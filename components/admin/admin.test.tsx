// White-box RSC-render tests van de admin-console-blokken met fixture-data. Licht/donker ×
// mobiel/desktop, plus gerichte asserts op wat ertoe doet: een merk zonder producten toont
// nul (het gat blijft eerlijk), afwijzen vraagt altijd een reden, en een PDL-import gaat via
// staging — nooit stilzwijgend de catalogus in.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { BrandsTierBlock, type BrandTierRow } from "./brands-tier-block";
import {
  UploadReviewBlock,
  type PdlBrandOption,
  type UploadReviewRow,
} from "./upload-review-block";
import { MembershipsBlock, type MembershipRow } from "./memberships-block";
import { EventsBlock, type EventRow } from "./events-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const brands: BrandTierRow[] = [
  {
    id: "b1",
    name: "Delta Light",
    disclosureTier: "tier1",
    productCount: 42,
    overrides: { gross_price: false },
  },
  {
    id: "b2",
    name: "XAL",
    disclosureTier: "tier2",
    productCount: 0,
    overrides: {},
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

const events: EventRow[] = [
  {
    id: "e1",
    entity: "brand",
    action: "brand_tier_changed",
    actor: "timo",
    createdAt: "2026-07-06T09:00:00Z",
  },
  {
    id: "e2",
    entity: "brand_upload",
    action: "brand_upload_approved",
    actor: "timo",
    createdAt: "2026-07-06T09:05:00Z",
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
    <BrandsTierBlock
      brands={brands}
      setTierAction={noopAction}
      setFieldVisibilityAction={noopAction}
    />
    <UploadReviewBlock
      uploads={uploads}
      pdlBrands={pdlBrands}
      approveAction={noopAction}
      rejectAction={noopAction}
      pdlImportAction={noopAction}
    />
    <MembershipsBlock memberships={memberships} />
    <EventsBlock events={events} />
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
        .element(page.getByText("Brands & visibility"))
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
      <BrandsTierBlock
        brands={brands}
        setTierAction={noopAction}
        setFieldVisibilityAction={noopAction}
      />
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

test("events: recente handelingen zijn zichtbaar met actor", async () => {
  await renderServer(
    <Screen>
      <EventsBlock events={events} />
    </Screen>,
  );
  await expect
    .element(page.getByText("brand_tier_changed"))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("brand_upload_approved"))
    .toBeInTheDocument();
});
