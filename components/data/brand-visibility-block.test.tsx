// White-box RSC-render-test van BrandVisibilityBlock (sprint 2.0a, blok 3): de éénmerks-
// variant van de vroegere BrandsTierBlock-tier/toggle-kolommen, nu op
// /brand-management/[brandId]. Licht/donker × mobiel/desktop + gerichte asserts op wat
// stil kapot kan gaan: de tier-select toont de huidige tier, de toggles tonen hun
// effectieve staat (basis/zichtbaar/verborgen), en alles is een <form> — werkt zonder JS.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { BrandVisibilityBlock } from "./brand-visibility-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-3xl">
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}

const screen = (
  <Screen>
    <BrandVisibilityBlock
      brandId="b1"
      disclosureTier="tier2"
      overrides={{ gross_price: false, kelvin: true }}
      setTierAction={noopAction}
      setFieldVisibilityAction={noopAction}
    />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`brand-visibility-block (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(screen);
      await expect
        .element(page.getByText("Visibility (disclosure)"))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./brand-visibility-block.${theme}.${device}.test.png`,
      });
    });
  }
}

test("tier-select toont de huidige tier van dit ene merk", async () => {
  await renderServer(screen);
  await expect
    .element(page.getByText("Visibility (disclosure)"))
    .toBeInTheDocument();
  const select = document.querySelector<HTMLSelectElement>(
    'select[aria-label="Disclosure tier"]',
  );
  expect(select).not.toBeNull();
  expect(select?.value).toBe("tier2");
  // Hangt aan brandId via een hidden input, geen prop op de select zelf.
  const hidden = select?.closest("form")?.querySelector<HTMLInputElement>(
    'input[name="brandId"]',
  );
  expect(hidden?.value).toBe("b1");
});

test("veld-toggles tonen de effectieve staat: override-false, override-true en basis", async () => {
  await renderServer(screen);
  await expect
    .element(page.getByText("Visibility (disclosure)"))
    .toBeInTheDocument();
  await expect.element(page.getByText("Price: hidden")).toBeInTheDocument();
  await expect.element(page.getByText("Kelvin: visible")).toBeInTheDocument();
  // CRI heeft geen override → basis, en schakelt daarom naar "true" bij een klik.
  await expect.element(page.getByText("CRI: base")).toBeInTheDocument();
  const criButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  ).find((b) => b.textContent?.includes("CRI"));
  const nextVisible = criButton
    ?.closest("form")
    ?.querySelector<HTMLInputElement>('input[name="visible"]');
  expect(nextVisible?.value).toBe("true");
});
