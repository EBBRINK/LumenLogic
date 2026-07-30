// White-box RSC-screenshottests van het substitutievoorstel-document met fixture-data.
// Licht/donker × mobiel/desktop, plus gerichte checks: beide armaturen in beeld, de
// duurzaamheidswinst veld-voor-veld, de kostentekst (F-08) en de bronvoetnoot. Ontbrekende
// data blijft eerlijk staan (niet stilzwijgend weggelaten).
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { formatDate } from "@/lib/format";
import { SubstitutionDoc } from "./substitution-doc";
import type { SubstitutionDocField } from "./substitution-doc";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const fields: SubstitutionDocField[] = [
  { field: "Color temperature", reference: "3000K", alternative: "3000K", source: "brand-provided" },
  { field: "CRI", reference: "90", alternative: "90", source: "brand-provided" },
  { field: "IP value", reference: "IP20", alternative: "IP20", source: "brand-provided" },
  { field: "Warranty", reference: "36 mo", alternative: "120 mo", source: "brand-provided" },
  { field: "Repairability", reference: "C", alternative: "A", source: "brand-provided" },
  { field: "Lifetime (EPD)", reference: "35000 u", alternative: "100000 u", source: "brand-provided" },
  { field: "Origin", reference: null, alternative: "België", source: "brand-provided" },
];

const doc = (
  <div className="min-h-screen bg-background p-6 text-foreground">
    <SubstitutionDoc
      dossierName="Ziekenhuis Noord"
      reference={{ name: "SASSO 100 CEIL", brandName: "XAL", articleCode: "L360-SASSO100" }}
      alternative={{ name: "ESPRIT CEIL", brandName: "Kreon", articleCode: "KR-ESP" }}
      fields={fields}
      savingNote="Saving € 50,00 per stuk (referentie € 310,00 → alternatief € 260,00). Prijs is informatief en weegt nooit mee in de rangschikking (F-08)."
      // REPARATIE 30 jul, bevinding 12: hier stond de kale "2026-07-07". Bug #9 heeft
      // precies dit weggehaald, dus de enige zichtbare plek van die wijziging stond
      // vastgepind op een formaat dat productie niet meer maakt. Nu dezelfde formatter als
      // app/projects/[id]/substitution/[proposalId]/page.tsx erdoorheen.
      createdAt={formatDate("2026-07-07")}
    />
  </div>
);

afterEach(() => document.documentElement.classList.remove("dark"));

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`substitutie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(doc);
      await expect.element(document.body).toBeInTheDocument();
      await page.screenshot({ path: `./substitution.${theme}.${device}.test.png` });
    });
  }
}

test("SubstitutionDoc: toont beide armaturen, de duurzaamheidswinst en de bronvoetnoot", async () => {
  await renderServer(doc);
  await expect.element(page.getByText("SASSO 100 CEIL")).toBeInTheDocument();
  await expect.element(page.getByText("ESPRIT CEIL")).toBeInTheDocument();
  // Garantie veld-voor-veld: de winst van het alternatief staat er.
  await expect.element(page.getByText("120 mo")).toBeInTheDocument();
  // Kostentekst (F-08) als losse tekst, niet als sortering.
  await expect.element(page.getByText(/Saving/)).toBeInTheDocument();
  // Bronvoetnoot: alle cijfers zijn merk-opgave.
  await expect.element(page.getByText(/brand-provided/)).toBeInTheDocument();
});

test("SubstitutionDoc: ontbrekende data blijft eerlijk zichtbaar, niet weggelaten", async () => {
  await renderServer(doc);
  // Herkomst-referentie is null → het veld blijft staan met een "geen data"-oordeel.
  await expect.element(page.getByText("Origin", { exact: true })).toBeInTheDocument();
  // exact: alleen de tabelcel "geen data" (de voetnoot bevat de frase ook).
  await expect.element(page.getByText("no data", { exact: true })).toBeInTheDocument();
  // UX-audit 30 jul (item 12): de voetnoot beloofde óók "never silently omitted". Dat is
  // op dít blad geen beleid maar een herhaling van wat de tabel hierboven laat zien. De
  // bronvermelding blijft — dat is een feit over dit document.
  expect(document.body.textContent).not.toContain("silently omitted");
  await expect.element(page.getByText(/brand-provided/)).toBeInTheDocument();
});

// De datum is het enige zichtbare spoor van bug #9 op dit blad: één formaat, geschreven
// maand, met jaartal. De negatieve assert pint dat de ISO-vorm er niet meer staat.
test("SubstitutionDoc: de datum draagt het app-brede formaat, geen ISO-slice", async () => {
  await renderServer(doc);
  await expect
    .element(page.getByText("Drawn up on 07 Jul 2026"))
    .toBeInTheDocument();
  expect(document.body.textContent).not.toContain("2026-07-07");
});
