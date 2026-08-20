// De live treffer-teller van /catalog (demosessie Brink Licht, 12 aug): het aantal
// treffers telt mee terwijl je typt, zonder enter. White-box in de browser, met de
// stub-telactie uit catalog-live-count-test-stubs.tsx (de vitest-RSC-brug staat geen kale
// functies over de servergrens toe). Screenshots licht/donker × mobiel/desktop.
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import {
  SchermMetTeller,
  VormMetOngeldigeInvoer,
  VormMetTeller,
  VormMetHerkenning,
  VormMetVerbredeTeller,
} from "./catalog-live-count-test-stubs";
import type { CatalogResult } from "./catalog-search";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
  window.__countCalls = [];
});

const qVeld = () => page.getByPlaceholder(/SASSO 100 or article/);

test("typen toont na de debounce het aantal treffers — zonder enter", async () => {
  await renderServer(<VormMetTeller />);
  await userEvent.type(qVeld(), "Ent");
  // Vóór de debounce (±200 ms) is er nog geen teller; erna wel. expect.element pollt.
  await expect.element(page.getByTestId("live-count")).toBeInTheDocument();
  expect(page.getByTestId("live-count").element().textContent).toContain("719");
  expect(page.getByTestId("live-count").element().textContent).toContain(
    "press Search",
  );
});

test("verder typen verkleint het getal (het klantvoorbeeld: 719 → 375 → 75)", async () => {
  await renderServer(<VormMetTeller />);
  await userEvent.type(qVeld(), "Entero 2700");
  await expect
    .element(page.getByTestId("live-count"))
    .toHaveTextContent(/75 matches/);
});

test("debounce: één woord vlot typen kost minder tellingen dan toetsaanslagen", async () => {
  await renderServer(<VormMetTeller />);
  await userEvent.type(qVeld(), "Entero"); // zes toetsaanslagen
  await expect.element(page.getByTestId("live-count")).toBeInTheDocument();

  // BEWUST GEEN `toHaveLength(1)`. Dat stond er eerst en was groen als de test alleen
  // draaide, maar viel om in de volle suite: onder belasting duurt één simulatie-toetsaanslag
  // soms langer dan de debounce-termijn van 200 ms, en dan telt hij twee keer. Dat is de
  // testomgeving die traag is, niet de debounce die stuk is — een test die daarop rood wordt,
  // meet de machine en niet de code.
  //
  // Wat de debounce wél belooft, en wat hier dus staat: minder tellingen dan toetsaanslagen,
  // en de láátste telling gaat over het hele woord (niet over een prefix).
  const calls = window.__countCalls ?? [];
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.length).toBeLessThan(6);
  expect(calls.at(-1)!.q).toBe("Entero");
});

test("zonder anker (geen merk, geen tekst) telt er niets", async () => {
  await renderServer(<VormMetTeller />);
  await userEvent.type(qVeld(), "En");
  await expect.element(page.getByTestId("live-count")).toBeInTheDocument();
  await userEvent.clear(qVeld());
  // Leeg veld → teller weg (en géén nieuwe telling met een leeg anker).
  await expect.poll(() => page.getByTestId("live-count").query()).toBeNull();
  const laatste = (window.__countCalls ?? []).at(-1);
  expect(laatste?.q).not.toBe("");
});

test("ongeldige invoer is geen crash maar een nette melding", async () => {
  await renderServer(<VormMetOngeldigeInvoer />);
  await userEvent.type(qVeld(), "Entero");
  await expect
    .element(page.getByTestId("live-count"))
    .toHaveTextContent(/live count unavailable/);
});

// Screenshots: het hele zoekscherm met resultaten, waarin de teller meebeweegt tijdens
// het typen — juist als het getal groter is dan wat het plafond toont, moet het er staan.
const resultaat: CatalogResult = {
  id: "p1",
  name: "ENTERO RD 2700K",
  brandName: "Delta Light",
  articleCode: "ENT-2700",
  supplierArticleCode: null,
  categoryPath: "Binnen >> Spots",
  kelvin: 2700,
  cri: 90,
  ipValue: "IP20",
  lumenOutput: 1200,
  grossPrice: "310.00",
  priceState: "actueel",
  lastPriceListName: "Price list 2026",
  lastPriceListValidUntil: "2026-12-31",
  matchKind: "fuzzy",
};

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`live teller in het zoekscherm (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <div className="min-h-screen bg-background p-6 text-foreground">
          <SchermMetTeller aantoonbaar={[resultaat]} total={719} />
        </div>,
      );
      await userEvent.type(qVeld(), "ero 2700"); // "Ent" stond er al → "Entero 2700"
      await expect
        .element(page.getByTestId("live-count"))
        .toHaveTextContent(/75 matches/);
      // De serverregel over de vórige zoekactie blijft staan; de live teller komt ernaast.
      await expect.element(page.getByTestId("result-cap")).toBeInTheDocument();
      await page.screenshot({
        path: `./catalog-live-teller.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── DE TERUGVAL NAAR DE BREDE VARIANT ───────────────────────────────────────────
//
// Sinds 20 aug moet élk zoekwoord voorkomen; levert dat niets op, dan valt de zoekopdracht
// terug op ≥1 woord. Die terugval mag nooit stil gebeuren: je typt een woord erbij, de
// stapel wordt gróter, en zonder melding klopt er in je hoofd niets meer van. OCR-aanvragen
// zitten vol verschrijvingen, dus dit is geen randgeval maar dagelijkse kost.
test("live teller meldt het als hij op de brede variant is teruggevallen", async () => {
  await renderServer(<VormMetVerbredeTeller />);
  await userEvent.type(qVeld(), "Entero 2700");
  await expect
    .element(page.getByTestId("live-count"))
    .toHaveTextContent(/no product has all your words/i);
});

test("het resultaatscherm meldt de terugval boven de plafondregel", async () => {
  await renderServer(
    <SchermMetTeller aantoonbaar={[resultaat]} total={412} verbreed />,
  );
  await expect
    .element(page.getByTestId("broadened"))
    .toHaveTextContent(/no product has all your search words/i);
  // De plafondregel blijft eronder staan: het zijn twee verschillende mededelingen.
  await expect.element(page.getByTestId("result-cap")).toBeInTheDocument();
});

test("zonder terugval staat die melding er niet", async () => {
  await renderServer(<SchermMetTeller aantoonbaar={[resultaat]} total={12} />);
  await expect.element(page.getByTestId("result-cap")).toBeInTheDocument();
  expect(page.getByTestId("broadened").query()).toBeNull();
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`terugvalmelding in het zoekscherm (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <div className="min-h-screen bg-background p-6 text-foreground">
          <SchermMetTeller aantoonbaar={[resultaat]} total={412} verbreed />
        </div>,
      );
      await expect.element(page.getByTestId("broadened")).toBeInTheDocument();
      await page.screenshot({
        path: `./catalog-terugval.${theme}.${device}.test.png`,
      });
    });
  }
}

// ── SPECWAARDEN UIT DE VRIJE TEKST, ZICHTBAAR GEMAAKT ───────────────────────────
//
// "Entero 2700" wordt gelezen als "Entero" + kleurtemperatuur 2700. Dat is raden, en raden
// dat je niet ziet kun je niet corrigeren — dus staat het op het scherm.
test("live teller vertelt dat 2700 als kleurtemperatuur gelezen is", async () => {
  await renderServer(<VormMetHerkenning />);
  await userEvent.type(qVeld(), "Entero 2700");
  await expect
    .element(page.getByTestId("live-herkend"))
    .toHaveTextContent(/2700 read as colour temperature/i);
  // En het getal versmalt in plaats van te verbreden — dat was de hele aanleiding.
  await expect.element(page.getByTestId("live-count")).toHaveTextContent(/1026/);
});

test("zonder herkende specwaarde staat die regel er niet", async () => {
  await renderServer(<VormMetHerkenning />);
  await userEvent.type(qVeld(), "Entero");
  await expect.element(page.getByTestId("live-count")).toBeInTheDocument();
  expect(page.getByTestId("live-herkend").query()).toBeNull();
});

test("het resultaatscherm noemt de herkende specwaarde en hoe je hem overstemt", async () => {
  await renderServer(
    <SchermMetTeller
      aantoonbaar={[resultaat]}
      total={1026}
      herkend={[{ token: "2700", veld: "kelvin", waarde: 2700, toegepast: true }]}
    />,
  );
  const regel = page.getByTestId("spec-tokens");
  await expect.element(regel).toHaveTextContent(/2700 read as colour temperature/i);
  await expect.element(regel).toHaveTextContent(/fill in the field yourself/i);
});

test("een geraden token dat overstemd is, zegt dat erbij", async () => {
  await renderServer(
    <SchermMetTeller
      aantoonbaar={[resultaat]}
      total={12}
      herkend={[{ token: "2700", veld: "kelvin", waarde: 2700, toegepast: false }]}
    />,
  );
  await expect
    .element(page.getByTestId("spec-tokens"))
    .toHaveTextContent(/your own value is used/i);
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`herkende specwaarde in het zoekscherm (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <div className="min-h-screen bg-background p-6 text-foreground">
          <SchermMetTeller
            aantoonbaar={[resultaat]}
            total={1026}
            herkend={[
              { token: "2700", veld: "kelvin", waarde: 2700, toegepast: true },
            ]}
          />
        </div>,
      );
      await expect.element(page.getByTestId("spec-tokens")).toBeInTheDocument();
      await page.screenshot({
        path: `./catalog-spectoken.${theme}.${device}.test.png`,
      });
    });
  }
}
