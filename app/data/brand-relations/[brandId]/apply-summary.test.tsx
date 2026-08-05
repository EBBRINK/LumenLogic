// C8 (reviewzwerm 2.5a): de uitkomst van een goedgekeurd merktemplate op het scherm.
//
// De action gooide de zes tellingen van applyTemplateProposal weg en redirectte; de
// doelpagina las geen searchParams. Er ging niets verloren (het eventspoor logt ze
// allemaal), maar de gebruiker zag ze niet op het moment dat hij keek.
//
// ⚠️ WAT DIT BESTAND WÉL EN NIET DEKT (bijgesteld na de bewijscontrole van 2.5a).
// Hier staat het MIDDENSTUK van de keten, en niet meer dan dat:
//
//   [action] → applySummaryQuery → readApplySummary → TemplateApplySummary  → [pagina]
//              └──────────────── deze tests ────────────────┘
//
// De helper `doorDeRedirect()` hieronder simuleert de redirect: hij bouwt de samenvatting
// met de hand en draait de action NOOIT. Dit bestand kon dus groen blijven terwijl de
// action weer het kale merkpad redirectte — precies bevinding C8 opnieuw. Dat is gemeten,
// niet vermoed.
//
// De naad aan de actionkant wordt bewaakt door ./upload-actions.test.ts: die draait
// approveTemplateProposalAction écht, vangt de NEXT_REDIRECT op en legt de querystring
// naast het template_apply_finished-event.
//
// De naad aan de PAGINAKANT (page.tsx bedraadt searchParams naar readApplySummary) is nog
// steeds ongedekt: geen enkele test in deze repo importeert een page.tsx, en deze pagina
// importeert next/link — de RSC-harnas kan een server component met next/link niet
// inladen (zie de kop van apply-summary.tsx). Haal regel 71 of 127 uit page.tsx weg en
// niets wordt rood. Bekend gat, geen bewezen dekking.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import {
  applySummaryQuery,
  readApplySummary,
  TemplateApplySummary,
  type ApplySummary,
} from "./apply-summary";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

function canvas(children: React.ReactNode) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

// De uitkomst zoals lib/repo/template-return.ts hem teruggeeft (ApplyTemplateResult).
const UITKOMST = {
  alreadyProcessed: false as const,
  createdProducts: 12,
  updatedProducts: 5,
  appliedFields: 48,
  skippedStaleFields: 3,
  priceLines: {
    priceListId: "0f0f0f0f-0000-4000-8000-000000000000",
    inserted: 120,
    updated: 7,
    archivedLines: 2,
  },
};

// Wat de action doet: uitkomst → querystring → redirect. En wat de pagina doet: de
// searchParams van die URL uitlezen. Next levert searchParams als plat object aan.
function doorDeRedirect(summary: ApplySummary) {
  const url = new URL(
    `https://x/data/brand-relations/abc?${applySummaryQuery(summary)}`,
  );
  return readApplySummary(Object.fromEntries(url.searchParams.entries()));
}

// ── De keten ─────────────────────────────────────────────────────────────────

test("de zes tellingen overleven de redirect en staan op het scherm", async () => {
  const summary = doorDeRedirect({ kind: "done", ...UITKOMST });
  expect(summary).not.toBeNull();

  const { container } = await renderServer(
    canvas(<TemplateApplySummary summary={summary!} />),
  );
  await expect
    .element(page.getByRole("heading", { name: "Template applied" }))
    .toBeInTheDocument();

  const tekst = container.textContent ?? "";
  for (const [label, waarde] of [
    ["Products created", "12"],
    ["Products updated", "5"],
    ["Fields applied", "48"],
    ["Fields skipped (stale)", "3"],
    ["Price lines added", "120"],
    ["Price lines updated", "7"],
    ["Price lines archived", "2"],
  ] as const) {
    expect(tekst).toContain(label);
    expect(tekst).toContain(waarde);
  }

  // Een getal zonder betekenis is geen terugkoppeling: bij overgeslagen velden hoort de
  // reden erbij (de stale-guard weigerde te overschrijven wat de gebruiker niet zag).
  expect(tekst).toContain("had changed in the catalogue");

  // Het bestaande eventkanaal wordt niet vervangen maar aangewezen — het blijft de
  // volledige bron van waarheid (template_apply_finished in het eventlog).
  const link = page.getByRole("link", { name: "event log" });
  await expect.element(link).toBeInTheDocument();
  expect(link.element().getAttribute("href")).toBe("/data/event-log");
});

test("zonder prijsregels blijven de prijs-tellingen weg (geen nullen suggereren werk)", async () => {
  const summary = doorDeRedirect({
    kind: "done",
    ...UITKOMST,
    priceLines: null,
  });
  const { container } = await renderServer(
    canvas(<TemplateApplySummary summary={summary!} />),
  );
  await expect
    .element(page.getByRole("heading", { name: "Template applied" }))
    .toBeInTheDocument();
  const tekst = container.textContent ?? "";
  expect(tekst).toContain("Products created");
  expect(tekst).not.toContain("Price lines");
});

test("zonder overgeslagen velden blijft de stale-uitleg weg", async () => {
  const summary = doorDeRedirect({
    kind: "done",
    ...UITKOMST,
    skippedStaleFields: 0,
  });
  const { container } = await renderServer(
    canvas(<TemplateApplySummary summary={summary!} />),
  );
  await expect
    .element(page.getByRole("heading", { name: "Template applied" }))
    .toBeInTheDocument();
  expect(container.textContent ?? "").not.toContain("had changed in the catalogue");
});

test("dubbelklik: 'al verwerkt' zegt dat er niets tweede keer geschreven is", async () => {
  const summary = doorDeRedirect({ kind: "already" });
  expect(summary).toEqual({ kind: "already" });
  const { container } = await renderServer(
    canvas(<TemplateApplySummary summary={summary!} />),
  );
  await expect
    .element(page.getByRole("heading", { name: "Already processed" }))
    .toBeInTheDocument();
  expect(container.textContent ?? "").toContain("nothing was written a second time");
});

// ── De querystring is gebruikersinvoer ───────────────────────────────────────

test("rommel in de querystring levert geen samenvatting op", () => {
  // Een gewoon paginabezoek: geen parameters, geen blok.
  expect(readApplySummary({})).toBeNull();
  // Handmatig geknoei — niets hiervan mag een blok (of tekst) op het scherm zetten.
  expect(readApplySummary({ applied: "done" })).toBeNull(); // vlag zonder tellingen
  expect(readApplySummary({ applied: "done", counts: "1,2,3" })).toBeNull(); // te kort
  expect(readApplySummary({ applied: "done", counts: "1,2,3,4,5" })).toBeNull();
  expect(readApplySummary({ applied: "done", counts: "a,b,c,d" })).toBeNull();
  expect(readApplySummary({ applied: "done", counts: "-1,2,3,4" })).toBeNull();
  expect(readApplySummary({ applied: "done", counts: "1,2,3,<script>" })).toBeNull();
  expect(readApplySummary({ applied: "ja", counts: "1,2,3,4" })).toBeNull();

  // Geldige tellingen met een kapotte prijs-parameter: de tellingen blijven, de
  // prijsregels vallen weg — nooit half geraden getallen tonen.
  const half = readApplySummary({ applied: "done", counts: "1,2,3,4", prices: "9,9" });
  expect(half).toMatchObject({ kind: "done", createdProducts: 1, priceLines: null });
});

// ── Opnamen ──────────────────────────────────────────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`apply-summary: opname (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      const summary = doorDeRedirect({ kind: "done", ...UITKOMST });
      await renderServer(canvas(<TemplateApplySummary summary={summary!} />));
      await expect
        .element(page.getByRole("heading", { name: "Template applied" }))
        .toBeInTheDocument();
      await page.screenshot({ path: `./apply-summary.${theme}.${device}.test.png` });
    });
  }
}
