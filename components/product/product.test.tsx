// White-box RSC-render van de productkaart in de drie disclosure-tiers (J-01, J-03, §4.11).
// De disclosures komen uit de échte resolveDisclosure — geen handgemaakte matrix, zodat de
// test aan de gedeelde beslisboom vastzit. Assert precies:
//   • tier1            → adviesprijs zichtbaar, geen aanvraagknop.
//   • tier2 (gated)    → "Request price via Brink", specs zichtbaar, GEEN prijs.
//   • tier3 (awaiting) → "Data awaiting brand", geen specs, geen prijs.
//
// LET OP bij de tier1-gevallen (gewijzigd bij reviewzwerm 2.5a, A5): die vroegen hun
// disclosure eerder op mét een EXTERNE context zonder project, en dat gaf een prijs —
// precies het fail-open-gedrag dat A5 beschrijft. De tier1-tak respecteert de context nu
// wél (§4.11), dus deze render-tests draaien op de kijker die de prijs ook echt hoort te
// zien. Wat hier getest wordt is de KAART (rendert hij een prijs die hij mag tonen), niet
// wie hem mag zien; die vraag hoort in lib/repo/disclosure.test.ts en staat daar.
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
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// ── De drie vereiste, precieze asserts ───────────────────────────────────────

test("tier1: toont de adviesprijs, geen aanvraagknop", async () => {
  const disclosure = resolveDisclosure("tier1", intern);
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
  // Geen pricerequest in tier1.
  expect(document.body.textContent ?? "").not.toContain("Prijs via Brink");
});

// UX-audit 30 jul (item 3): de prijs stond op text-2xl en was daarmee de GROOTSTE tekst
// op de productpagina — groter dan de productnaam. Ijzeren regel 2 zegt dat geld de
// rangschikking niet raakt; dan hoort het ook niet het luidste element te zijn. De prijs
// blijft volledig zichtbaar, alleen niet meer groter dan de naam van het product.
test("tier1: de prijs is zichtbaar maar nooit groter dan de productnaam", async () => {
  const disclosure = resolveDisclosure("tier1", intern);
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
  await expect.element(page.getByText("310,00")).toBeInTheDocument();
  const prijs = document.querySelector<HTMLElement>("[data-price]");
  const titel = document.querySelector<HTMLElement>('[data-slot="card-title"]');
  expect(prijs).not.toBeNull();
  expect(titel).not.toBeNull();
  const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
  expect(px(prijs!)).toBeLessThan(px(titel!));
  // En hij staat er nog echt, met het volledige bedrag.
  expect(prijs!.textContent).toContain("310,00");
});

test("tier2 gated: 'Request price via Brink', specs wél, prijs niet", async () => {
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
  await expect.element(page.getByText("Request price via Brink")).toBeInTheDocument();
  // Specs zichtbaar in tier2 (bv. de kleurtemperatuur-waarde).
  await expect.element(page.getByText("2700 K")).toBeInTheDocument();
  // Maar geen prijs: geen euro-teken op de kaart.
  expect(document.body.textContent ?? "").not.toContain("€");
});

test("tier3: 'Data awaiting brand', geen specs, geen prijs", async () => {
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
  await expect.element(page.getByText("Data awaiting brand")).toBeInTheDocument();
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
      disclosure={resolveDisclosure("tier1", intern)}
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

// Ankerassertie per tier: precies het onderscheidende zinnetje van díe tier. Zo pint
// elke screenshot-test ook wát er op de foto hoort te staan; `document.body` alleen
// bleef groen als ProductCard niets rendert.
//
// Twéé ankers per tier waar de kaart specs toont. Met alleen het prijs-/gated-anker zaten
// alle ankers in PriceBlock: `rows.length = 0` haalde de complete 13-regels specificatie-
// tabel weg (de kaart valt dan terug op "No specifications available.") en deze 12 tests
// bleven groen — gemeten. Het tweede anker is een specrij, zodat de tabel meetelt.
// tier3 toont per definitie geen specs (awaitingData), dus daar ís de wachttekst de inhoud.
const anchors: Record<keyof typeof screens, (string | RegExp)[]> = {
  "tier1-prijs": ["€ 310,00", "1200 lm"],
  "tier2-gated": ["Request price via Brink", "Ra 90"],
  "tier3-awaiting": ["Data awaiting brand."],
};

for (const [name, ui] of Object.entries(screens)) {
  for (const theme of ["light", "dark"] as const) {
    for (const [device, viewport] of Object.entries(viewports)) {
      test(`${name} (${theme}, ${device})`, async () => {
        await page.viewport(viewport.width, viewport.height);
        if (theme === "dark") document.documentElement.classList.add("dark");
        await renderServer(<Screen>{ui}</Screen>);
        for (const anchor of anchors[name as keyof typeof screens]) {
          await expect.element(page.getByText(anchor).first()).toBeInTheDocument();
        }
        await page.screenshot({ path: `./product-${name}.${theme}.${device}.test.png` });
      });
    }
  }
}
