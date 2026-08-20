// Bericht-klaarzetten-blok (stap 7): RSC-test met screenshots (light/dark ×
// mobile/desktop) van het detailpagina-blok — servergegenereerde tekst in een readonly
// textarea, kopieerknop die het event-callback aanroept, template-downloadknop ernaast.
import { page } from "vitest/browser";
import { afterEach, expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { BrandMessageBlock } from "./brand-message-block";
import { TemplateDownloadLink } from "./template-download-link";
import { buildBrandMessage } from "@/lib/brand-message";
import { bucketScore, FIELD_CATALOG } from "@/lib/field-catalog";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

// Zelfde soort stand als de detail-fixture: deels gevulde data + verlopen prijslijst.
const filled: Record<string, number> = {
  supplier_article_code: 30,
  name_en: 30,
  category: 30,
  list_price_excl_vat: 12,
  kelvin: 3,
  color_1: 15,
};
const message = buildBrandMessage({
  brandName: "Occhio",
  contactName: "Anna Vogel",
  productCount: 30,
  priceListIndicator: "verlopen",
  priceListValidUntil: "2026-03-01",
  buckets: [...FIELD_CATALOG]
    .sort((a, b) => a.order - b.order)
    .map((bucket) => ({ bucket, score: bucketScore(bucket, filled, 30) })),
});

// Props over de server→client-grens moeten server-referenties zijn: noopAction.
function blok() {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <section className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Bericht klaarzetten</h2>
          <TemplateDownloadLink />
        </div>
        <BrandMessageBlock
          brandId="b-occhio"
          message={message}
          onCopied={noopAction}
        />
      </section>
    </main>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`bericht-klaarzetten-blok (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(blok());
      // Anker uit BrandMessageBlock zelf: de <h2> in `blok()` staat in dít bestand en
      // zou ook groen blijven als het blok niets rendert. De textarea draagt de
      // servergegenereerde tekst — dat is het inhoudelijke bewijs.
      await expect
        .element(page.getByLabelText("Message to the brand"))
        .toHaveValue(message);
      await page.screenshot({
        path: `./data-merkrelatie-bericht.${theme}.${device}.test.png`,
      });
    });
  }
}

test("tekst staat readonly in de textarea; templateknop ernaast", async () => {
  await renderServer(blok());
  const textarea = page.getByLabelText("Message to the brand");
  await expect.element(textarea).toHaveValue(message);
  await expect.element(textarea).toHaveAttribute("readonly");
  await expect
    .element(page.getByRole("link", { name: /Download Excel template/ }))
    .toHaveAttribute("href", "/brand-management/template");
});

// Onder volle parallelle testlast hydrateert het client-eiland soms traag of pas na
// een verse render — vandaar de klik-retry-lus én een test-retry met verse render.
test(
  "kopieerknop: klik toont 'Copied' (event-callback vuurt in dezelfde handler)",
  { retry: 2 },
  async () => {
    await renderServer(blok());
    await vi.waitFor(
      async () => {
        await page.getByRole("button", { name: /Copy message|Copied/ }).click();
        expect(document.body.textContent).toContain("Copied");
      },
      { timeout: 10_000, interval: 250 },
    );
  },
);
