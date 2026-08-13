// White-box RSC-render tests van de instellingen-blokken met fixture-data. Licht/donker ×
// mobiel/desktop, plus gerichte asserts op de gedragingen die ertoe doen: de laatste
// gebruiker is niet te verwijderen, de budgetteller toont verbruik/cap, en de XIS-sleutel
// wordt NOOIT als waarde getoond — alleen de aan/afwezigheid ervan.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { AllowedEmailsBlock } from "./allowed-emails-block";
import type { AllowedEmailRow } from "./allowed-emails-block";
import { LlmBudgetBlock } from "./llm-budget-block";
import { XisBlock } from "./xis-block";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const emails: AllowedEmailRow[] = [
  { email: "tester@voorbeeld.nl", addedBy: "migratie-0004" },
  { email: "eduard@brink.nl", addedBy: "timo" },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-7xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Instellingen
        </h1>
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}

const settingsScreen = (
  <Screen>
    <AllowedEmailsBlock
      emails={emails}
      addAction={noopAction}
      removeAction={noopAction}
    />
    <LlmBudgetBlock budgetEur={50} spentEur={32.5} saveAction={noopAction} />
    <XisBlock environment="sandbox" keyIsSet saveAction={noopAction} />
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`instellingen (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(settingsScreen);
      await expect.element(document.body).toBeInTheDocument();
      // De drie blokken staan er.
      await expect.element(page.getByText("Users")).toBeInTheDocument();
      await expect.element(page.getByText("LLM budget")).toBeInTheDocument();
      await expect.element(page.getByText("XIS connection")).toBeInTheDocument();
      await page.screenshot({
        path: `./settings.${theme}.${device}.test.png`,
      });
    });
  }
}

test("gebruikers: adressen zichtbaar, verwijderen kan bij meer dan één adres", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={emails}
        addAction={noopAction}
        removeAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("tester@voorbeeld.nl"))
    .toBeInTheDocument();
  await expect.element(page.getByText("eduard@brink.nl")).toBeInTheDocument();
  const removeBtn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove eduard@brink.nl"]',
  );
  expect(removeBtn).not.toBeNull();
  expect(removeBtn?.disabled).toBe(false);
});

test("gebruikers: het laatste adres is NIET te verwijderen (fail-safe)", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={[emails[0]]}
        addAction={noopAction}
        removeAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("tester@voorbeeld.nl"))
    .toBeInTheDocument();
  const removeBtn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove tester@voorbeeld.nl"]',
  );
  expect(removeBtn).not.toBeNull();
  expect(removeBtn?.disabled).toBe(true);
});

// ── Bevestiging vóór verwijderen (UX-audit 30 jul, bug #5) ──────────────────
//
// De prullenbak was een kale form-submit: één klik en het adres was weg. Nu opent hij
// een bevestiging die het adres bij naam noemt, met een weg terug.
test("verwijderen vraagt om bevestiging en noemt het adres bij naam", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={emails}
        addAction={noopAction}
        removeAction={noopAction}
      />
    </Screen>,
  );
  const knop = page.getByRole("button", { name: "Remove eduard@brink.nl" });
  await expect.element(knop).toBeInTheDocument();
  // De trigger submit zelf niets meer — anders is de bevestiging een sierstuk.
  expect(knop.element().getAttribute("type")).toBe("button");
  await knop.click();

  await expect
    .element(page.getByRole("heading", { name: "Remove eduard@brink.nl?" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Remove address" }))
    .toBeInTheDocument();
  // Er is altijd een weg terug.
  await expect
    .element(page.getByRole("button", { name: "Cancel" }))
    .toBeInTheDocument();
});

// De echte lock-out uit de audit: met twee adressen mocht je jezélf verwijderen, en de
// enige weg terug loopt via dit scherm — waar je dan niet meer bij kunt.
test("je eigen adres is niet te verwijderen, ook niet met meerdere adressen", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={emails}
        addAction={noopAction}
        removeAction={noopAction}
        sessionEmail="tester@voorbeeld.nl"
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("eduard@brink.nl"))
    .toBeInTheDocument();
  const eigen = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove tester@voorbeeld.nl"]',
  );
  expect(eigen).not.toBeNull();
  expect(eigen?.disabled).toBe(true);
  expect(eigen?.getAttribute("title")).toBe(
    "Your own address — ask a colleague to remove it",
  );
  // De rij van de ander blijft gewoon verwijderbaar — anders is er geen uitweg meer.
  const ander = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove eduard@brink.nl"]',
  );
  expect(ander?.disabled).toBe(false);
});

// Hoofdletters/spaties in het sessieadres mogen de bescherming niet omzeilen.
test("eigen adres wordt hoofdletter-ongevoelig herkend", async () => {
  await renderServer(
    <Screen>
      <AllowedEmailsBlock
        emails={emails}
        addAction={noopAction}
        removeAction={noopAction}
        sessionEmail="  Tester@Voorbeeld.NL "
      />
    </Screen>,
  );
  await expect
    .element(page.getByText("eduard@brink.nl"))
    .toBeInTheDocument();
  const eigen = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove tester@voorbeeld.nl"]',
  );
  expect(eigen?.disabled).toBe(true);
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`verwijder-bevestiging (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <Screen>
          <AllowedEmailsBlock
            emails={emails}
            addAction={noopAction}
            removeAction={noopAction}
            sessionEmail="tester@voorbeeld.nl"
          />
        </Screen>,
      );
      await page.getByRole("button", { name: "Remove eduard@brink.nl" }).click();
      await expect
        .element(page.getByRole("heading", { name: "Remove eduard@brink.nl?" }))
        .toBeInTheDocument();
      // De dialoog animeert in (duration-100 in components/ui/dialog.tsx); zonder
      // deze pauze legt de opname een half-doorzichtige, dubbel-belichte staat vast.
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({
        path: `./settings-verwijder-bevestiging.${theme}.${device}.test.png`,
      });
    });
  }
}

test("budget: verbruik en cap staan er; overschrijding toont een amber-notitie, geen rood alarm", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={20} spentEur={27.4} saveAction={noopAction} />
    </Screen>,
  );
  // teller toont zowel verbruik als cap
  await expect.element(page.getByText("€ 27,40")).toBeInTheDocument();
  await expect
    .element(page.getByText("Monthly cap exceeded — check the spend."))
    .toBeInTheDocument();
  // De gewone tak moet blijven rékenen: 27,40 van 20 loopt over de 100 heen en wordt
  // afgekapt op 100. Zonder deze assert kan een latere edit de takken verwisselen
  // (positieve cap valt in de cap-0-tak) zonder dat één test rood wordt.
  expect(
    page.getByRole("progressbar").query()?.getAttribute("aria-valuenow"),
  ).toBe("100");
});

test("budget: een normale cap rekent het percentage écht uit", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={50} spentEur={25} saveAction={noopAction} />
    </Screen>,
  );
  await expect.element(page.getByText("€ 25,00")).toBeInTheDocument();
  const meter = page.getByRole("progressbar").query();
  expect(meter?.getAttribute("aria-valuenow")).toBe("50");
  expect(document.body.textContent).not.toContain("no AI spend is allowed");
});

// Negatieve controle: "No monthly cap set." geldt vanaf nu UITSLUITEND voor null.
// Cap 0 is wél een cap (de strengste) en hoort hier dus niet meer bij — zie de twee
// tests hieronder. Deze asserts blijven ongewijzigd: ze bewijzen dat de fix voor
// cap 0 het null-geval niet meesleurt.
test("budget null (géén cap) → neutrale melding, geen meter", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={null} spentEur={5} saveAction={noopAction} />
    </Screen>,
  );
  await expect
    .element(page.getByText("No monthly cap set."))
    .toBeInTheDocument();
  expect(page.getByRole("progressbar").query()).toBeNull();
});

test("budget 0 is een hard plafond, NIET 'geen cap'", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={0} spentEur={0} saveAction={noopAction} />
    </Screen>,
  );
  // Eerst wachten tot er écht iets staat — anders slagen de not.toContain-asserts
  // hieronder op een nog lege DOM en vangen ze niets.
  await expect
    .element(page.getByText(/no AI spend is allowed this month/))
    .toBeInTheDocument();
  // ⬇ Dit ving de OUDE bug: bij cap 0 verscheen letterlijk "No monthly cap set.",
  // terwijl de domeinlaag (lib/ai/ocr.ts:535, lib/ai/vangnet.ts:537) juist ALLES blokkeert.
  expect(document.body.textContent).not.toContain("No monthly cap set.");
  const meter = page.getByRole("progressbar").query();
  expect(meter).not.toBeNull();
  // ⬇ Deze twee vangen de naïeve fix (alleen `> 0` → `>= 0` op de oude regel 24):
  // 0/0 = NaN geeft aria-valuenow="NaN" plus style="width:NaN%", en die ongeldige CSS
  // valt weg waarna de binnen-div als block alsnog 100% breed rendert — bij toeval,
  // niet bij ontwerp. Beide moeten op het attribuut/de style, niet op textContent:
  // dáár staan attribuutwaarden niet in, dus een assert op body.textContent zou
  // vacuüm slagen en precies deze fout doorlaten.
  expect(meter?.getAttribute("aria-valuenow")).toBe("100");
  expect(
    (meter?.firstElementChild as HTMLElement | null)?.style.width,
  ).toBe("100%");
  // Nul speelruimte, maar niets overschreden: geen amber-notitie.
  expect(document.body.textContent).not.toContain("Monthly cap exceeded");
});

test("cap 0 met uitgaven → meter vol én overschrijding gemeld", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock budgetEur={0} spentEur={0.42} saveAction={noopAction} />
    </Screen>,
  );
  // Oud rood: `over` was false omdat `hasBudget` bij cap 0 al false was.
  await expect
    .element(page.getByText("Monthly cap exceeded — check the spend."))
    .toBeInTheDocument();
  await expect.element(page.getByText("€ 0,42")).toBeInTheDocument();
  const meter = page.getByRole("progressbar").query();
  expect(meter).not.toBeNull();
  expect(meter?.getAttribute("aria-valuenow")).toBe("100");
});

// Aparte screenshotlus voor de twee NIEUWE cap-0-toestanden; de bestaande
// settings.*.test.png-lus blijft ongemoeid. Bewust géén derde blok voor null erbij:
// bij drie blokken schildert de harness op 375px de onderste kaart niet meer bij
// (de opname is dan 1019px hoog met een lege staart), en het null-geval verandert
// door deze sprint niets — dat bewaakt de negatieve-controletest hierboven.
const budgetCapScreen = (
  <Screen>
    <LlmBudgetBlock budgetEur={0} spentEur={0} saveAction={noopAction} />
    <LlmBudgetBlock budgetEur={0} spentEur={0.42} saveAction={noopAction} />
  </Screen>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`budget cap nul (${theme}, ${device})`, async () => {
      // Exact de viewports van de andere lussen. De harness legt full-page vast en
      // schaalt naar de gevraagde hoogte: een hoogte van 1400 leverde 193 px brede
      // mobiele PNG's (51%), waarop de nieuwe regel onleesbaar was. Afkappen doet de
      // viewport-hoogte niet — settings.light.mobile.test.png is 980 px uit 812.
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(budgetCapScreen);
      // Wacht op béide toestanden vóór de opname — de bovenste (cap 0, niets
      // uitgegeven) is juist de nieuwe die deze opname documenteert.
      // .first(): beide cap-0-kaarten tonen die regel, dus de locator raakt er twee.
      await expect
        .element(page.getByText(/no AI spend is allowed this month/).first())
        .toBeInTheDocument();
      await expect
        .element(page.getByText("Monthly cap exceeded — check the spend."))
        .toBeInTheDocument();
      await page.screenshot({
        path: `./settings-budget-cap-nul.${theme}.${device}.test.png`,
      });
    });
  }
}

test("XIS: de echte sleutel wordt nooit gerenderd — alleen de aanwezigheid", async () => {
  const secret = "xis-live-supersecret-key-123";
  await renderServer(
    <Screen>
      <XisBlock environment="productie" keyIsSet saveAction={noopAction} />
    </Screen>,
  );
  // 'ingesteld' verschijnt, de geheime waarde staat nergens in de DOM.
  await expect.element(page.getByText("set")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain(secret);
  // Het invoerveld is leeg (toont nooit de opgeslagen waarde).
  const input = document.querySelector<HTMLInputElement>("#xis-key");
  expect(input?.value).toBe("");
});

// ── UX-audit 30 jul, bug #10: copy die zichzelf tegensprak ───────────────────
// De hulptekst onder het sleutelveld stond er onvoorwaardelijk: een sleutel die "not set
// yet" is vertelde je óók hem leeg te laten "om de huidige te behouden". Er ís er dan geen.
test("XIS: 'leave empty to keep' staat er alleen als er écht een sleutel is", async () => {
  await renderServer(
    <Screen>
      <XisBlock environment="sandbox" keyIsSet saveAction={noopAction} />
    </Screen>,
  );
  await expect.element(page.getByText("set")).toBeInTheDocument();
  expect(document.body.textContent).toContain(
    "Leave empty to keep the current key.",
  );
});

test("XIS: zonder sleutel belooft de hulptekst geen 'huidige sleutel'", async () => {
  await renderServer(
    <Screen>
      <XisBlock environment="sandbox" keyIsSet={false} saveAction={noopAction} />
    </Screen>,
  );
  await expect.element(page.getByText("not set yet")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain(
    "Leave empty to keep the current key.",
  );
});

// De budgetuitsplitsing telde niet op: alleen 'vangnet' en 'ocr' stonden op het scherm,
// terwijl 'leesroute' stil in het totaal meeliep. De uitsplitsing komt nu uit één
// group-by, en wat niet in die lijst zit valt zichtbaar onder "Other".
test("LLM-budget: de uitsplitsing telt op tot de teller erboven", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock
        budgetEur={50}
        spentEur={2.4}
        breakdown={[
          { purpose: "leesroute", eur: 2.07 },
          { purpose: "vangnet", eur: 0.23 },
          { purpose: "ocr", eur: 0.1 },
        ]}
        saveAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("AI reading route")).toBeInTheDocument();
  await expect.element(page.getByText("€ 2,07")).toBeInTheDocument();
  // "AI fallback" staat ook in de kaartbeschrijving erboven — vandaar de dt-selector.
  await expect
    .element(page.getByRole("term").filter({ hasText: "AI fallback" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("OCR (image PDFs)")).toBeInTheDocument();
  // 2,07 + 0,23 + 0,10 = 2,40 → geen restpost.
  expect(document.body.textContent).not.toContain("Other");
});

test("LLM-budget: een gat tussen teller en uitsplitsing wordt zichtbaar als 'Other'", async () => {
  await renderServer(
    <Screen>
      <LlmBudgetBlock
        budgetEur={50}
        spentEur={2.4}
        breakdown={[{ purpose: "vangnet", eur: 0.23 }]}
        saveAction={noopAction}
      />
    </Screen>,
  );
  await expect.element(page.getByText("Other")).toBeInTheDocument();
  await expect.element(page.getByText("€ 2,17")).toBeInTheDocument();
});
