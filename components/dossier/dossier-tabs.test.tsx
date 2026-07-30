// White-box RSC-render/screenshottests van de dossier-tabbalk. Deze had tot sprint
// 2.0b géén enkele dekking: geen testfile, geen screenshot, alleen geïmporteerd door
// app/projects/[id]/layout.tsx. Naast de merkkleur (teal actieve streep, DESIGN.md O12)
// dekt dit ook de fase-logica en de prefix-matching, die daarvoor ongetoetst waren.
//
// Valkuil bij het beoordelen van de PNG's: page.viewport() wordt geklemd door het
// headless browservenster — "mobile" is hier feitelijk 333×720 en "desktop" 1152×720.
// Dat blijft onder het md:-breekpunt, dus het onderscheid werkt; de beelden zijn alleen
// kleiner dan hun naam suggereert.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { DossierTabs } from "./dossier-tabs";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const DOSSIER = "p-1";
const BASE = `/projects/${DOSSIER}`;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

// Gegund + wachtende review: dan staan alle vijf tabs én de badge in beeld.
const tabs = (pathname: string) => (
  <div className="min-h-screen bg-background p-4 text-foreground">
    <DossierTabs
      dossierId={DOSSIER}
      phase="awarded"
      reviewPending={2}
      reviewTotal={4}
      pathname={pathname}
    />
  </div>
);

// renderServer rendert asynchroon door; eerst op een element wachten, anders zijn de
// querySelectors hieronder nog leeg. Zelfde patroon als huisstijl.test.tsx.
async function render(pathname: string) {
  await renderServer(tabs(pathname));
  await expect
    .element(page.getByRole("link", { name: "Lines" }))
    .toBeInTheDocument();
}

// ── Screenshots ──────────────────────────────────────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`dossier-tabbalk (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await render(`${BASE}/review`);
      await expect
        .element(page.getByRole("link", { name: "Work preparation" }))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./dossier-tabs.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── Merkkleur op de actieve tab (DESIGN.md O12) ──────────────────────────────

for (const theme of ["light", "dark"] as const) {
  test(`actieve tab draagt de teal streep (${theme})`, async () => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    await render(`${BASE}/quote`);

    const active = page.getByRole("link", { name: "Estimate" }).element();
    const sActive = getComputedStyle(active);
    // Teal #1BA89A i.p.v. het oude --foreground. ⚠ Op wit is dat 2,95:1 en dus
    // onder de 3:1-drempel voor UI-elementen — bewust aanvaard omdat de stand óók
    // door labelkleur en gewicht wordt gedragen (kit §11: kleur nooit als enige
    // onderscheid). Zie DESIGN.md O12.
    expect(sActive.borderBottomColor).toBe("rgb(27, 168, 154)");
    expect(sActive.borderBottomWidth).toBe("2px");
    expect(sActive.fontWeight).toBe("500");
    expect(sActive.color).toBe(
      theme === "dark" ? "rgb(255, 255, 255)" : "rgb(26, 26, 26)",
    );

    // Het tweede en derde signaal naast de kleur: inactief is lichter én normaal
    // van gewicht, met de 2px al gereserveerd zodat er geen sprong ontstaat.
    const inactive = page.getByRole("link", { name: "Lines" }).element();
    const sInactive = getComputedStyle(inactive);
    expect(sInactive.borderBottomWidth).toBe("2px");
    expect(sInactive.fontWeight).toBe("400");
    expect(sInactive.color).toBe(
      theme === "dark" ? "rgb(176, 184, 196)" : "rgb(142, 155, 168)",
    );
  });
}

// ── Fase- en prefix-logica (was ongedekt) ────────────────────────────────────

test("Work preparation bestaat alleen in gegund-stand, niet in tender", async () => {
  // Geen grijze-disabled tab: in tender wordt hij helemaal niet gerenderd.
  await renderServer(
    <DossierTabs
      dossierId={DOSSIER}
      phase="tender"
      reviewPending={0}
      reviewTotal={0}
      pathname={BASE}
    />,
  );
  await expect
    .element(page.getByRole("link", { name: "Lines" }))
    .toBeInTheDocument();
  expect(
    page.getByRole("link", { name: "Work preparation" }).query(),
  ).toBeNull();
  // De armaturenstaat staat er in beide fasen wél.
  await expect
    .element(page.getByRole("link", { name: "Luminaire schedule" }))
    .toBeInTheDocument();
});

test("Lines blijft actief op de regel- en importsubpaden", async () => {
  for (const path of [BASE, `${BASE}/line/l-1`, `${BASE}/import/i-1`]) {
    await render(path);
    const lines = page.getByRole("link", { name: "Lines" }).element();
    expect(
      getComputedStyle(lines).borderBottomColor,
      `Lines hoort actief te zijn op ${path}`,
    ).toBe("rgb(27, 168, 154)");
  }
});

test("de badge toont het aantal wachtende items, niet het totaal", async () => {
  // ②④ uit functioneel ontwerp §3.3: wachtend telt, niet het totaal.
  await render(`${BASE}/review`);
  const review = page.getByRole("link", { name: /Review/ }).element();
  expect(review.textContent).toContain("2");
  // Geen assertion op de badge-kleur: die staat nu nog op amber en verandert in de
  // statuskleuren-migratie. Een test die amber vastpint werkt daar tegen.
});
