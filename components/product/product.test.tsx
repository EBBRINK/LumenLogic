// White-box RSC-render van de productkaart in de drie disclosure-tiers (J-01, J-03, §4.11).
// De disclosures komen uit de échte resolveDisclosure — geen handgemaakte matrix, zodat de
// test aan de gedeelde beslisboom vastzit. Assert precies:
//   • tier1            → adviesprijs zichtbaar, geen aanvraagknop.
//   • tier2 (gated)    → "Prijs via Brink aanvragen", specs zichtbaar, GEEN prijs.
//   • tier3 (awaiting) → "Data in afwachting van merk", geen specs, geen prijs.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { resolveDisclosure, type ViewerContext } from "@/lib/repo/disclosure";
import { noopAction } from "@/lib/test-actions";
import { ProductCard, type ProductSpec } from "./product-card";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const externZonderProject: ViewerContext = { internal: false, hasApprovedProject: false };
const intern: ViewerContext = { internal: true, hasApprovedProject: false };

// Eén compleet gevuld product; per test hergebruikt met de passende tier/prijs.
const baseSpec: ProductSpec = {
  id: "p1",
  name: "SASSO 100 SQ SP CEIL",
  brandName: "XAL",
  brandId: "b1",
  categoryPath: "Inbouw / Spots",
  lumenOutput: 1200,
  maxWattage: "17.90",
  kelvin: 2700,
  cri: 90,
  ipValue: "IP20",
  beamAngle: "36.00",
  dimmable: "DALI",
  color1: "wit",
  tier2Source: { kelvin: "parsed-from-name" }, // H-09: herkomst per verrijkt veld
  warrantyMonths: 60,
  repairability: "goed",
  epdLifetimeHours: 50000,
  countryOfOrigin: "AT",
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// ── De drie vereiste, precieze asserts ───────────────────────────────────────

test("tier1: toont de adviesprijs, geen aanvraagknop", async () => {
  const disclosure = resolveDisclosure("tier1", externZonderProject);
  await renderServer(
    <Screen>
      <ProductCard
        spec={baseSpec}
        disclosure={disclosure}
        price={{ grossPrice: "310.00", currency: "EUR" }}
        overrides={{}}
        requestAction={noopAction}
      />
    </Screen>,
  );
  // Prijs zichtbaar (€ 310,00 — assert op het getal i.v.m. de currency-spatie).
  await expect.element(page.getByText("310,00")).toBeInTheDocument();
  // Geen prijsaanvraag in tier1.
  expect(document.body.textContent ?? "").not.toContain("Prijs via Brink");
});

test("tier2 gated: 'Prijs via Brink aanvragen', specs wél, prijs niet", async () => {
  const disclosure = resolveDisclosure("tier2", externZonderProject);
  await renderServer(
    <Screen>
      <ProductCard
        spec={baseSpec}
        disclosure={disclosure}
        price={null}
        overrides={{}}
        requestAction={noopAction}
      />
    </Screen>,
  );
  // De gated-knop staat er.
  await expect.element(page.getByText("Prijs via Brink aanvragen")).toBeInTheDocument();
  // Specs zichtbaar in tier2 (bv. de kleurtemperatuur-waarde).
  await expect.element(page.getByText("2700 K")).toBeInTheDocument();
  // Maar geen prijs: geen euro-teken op de kaart.
  expect(document.body.textContent ?? "").not.toContain("€");
});

test("tier3: 'Data in afwachting van merk', geen specs, geen prijs", async () => {
  const disclosure = resolveDisclosure("tier3", intern);
  await renderServer(
    <Screen>
      <ProductCard
        spec={baseSpec}
        disclosure={disclosure}
        price={null}
        overrides={{}}
        requestAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Data in afwachting van merk")).toBeInTheDocument();
  const body = document.body.textContent ?? "";
  // Naam blijft altijd zichtbaar, maar geen specs en geen prijs.
  expect(body).toContain("SASSO 100");
  expect(body).not.toContain("2700 K");
  expect(body).not.toContain("Prijs via Brink");
  expect(body).not.toContain("€");
});

// J-04: een per-veld-override verbergt één veld, ook al toont de tier specs.
test("tier2: per-veld-override verbergt de kleurtemperatuur", async () => {
  const disclosure = resolveDisclosure("tier2", intern);
  await renderServer(
    <Screen>
      <ProductCard
        spec={baseSpec}
        disclosure={disclosure}
        price={{ grossPrice: "310.00", currency: "EUR" }}
        overrides={{ kelvin: false }}
        requestAction={noopAction}
      />
    </Screen>,
  );
  // Wacht op een aanwezig veld zodat de render gegarandeerd geflusht is, lees dán het negatief.
  await expect.element(page.getByText("Ra 90")).toBeInTheDocument(); // andere specs blijven
  expect(document.body.textContent ?? "").not.toContain("2700 K"); // verborgen veld → geen rij
});

// ── Visuele dekking: de drie tiers × licht/donker × mobiel/desktop ───────────

const screens = {
  "tier1-prijs": (
    <ProductCard
      spec={baseSpec}
      disclosure={resolveDisclosure("tier1", externZonderProject)}
      price={{ grossPrice: "310.00", currency: "EUR" }}
      overrides={{}}
      requestAction={noopAction}
    />
  ),
  "tier2-gated": (
    <ProductCard
      spec={baseSpec}
      disclosure={resolveDisclosure("tier2", externZonderProject)}
      price={null}
      overrides={{}}
      requestAction={noopAction}
    />
  ),
  "tier3-awaiting": (
    <ProductCard
      spec={baseSpec}
      disclosure={resolveDisclosure("tier3", intern)}
      price={null}
      overrides={{}}
      requestAction={noopAction}
    />
  ),
} as const;

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(<Screen>{ui}</Screen>);
        await expect.element(document.body).toBeInTheDocument();
        await page.screenshot({ path: `./product-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}
