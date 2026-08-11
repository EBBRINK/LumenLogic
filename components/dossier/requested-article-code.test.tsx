// Het gevraagde artikelnummer op de regel-detailpagina (docs/goal-artikelnummer-matching,
// B5). Twee toestanden, plus de opnamen.
//
// ⚠️ Waarom dit hier staat en niet als test op page.tsx: die pagina geeft server actions
// door aan client-componenten, en in dit RSC-harnas verliezen die onder vi.mock hun
// "use server"-markering — de render valt dan om met "Functions cannot be passed directly
// to Client Components". Gemeten, meerdere omwegen geprobeerd (next/link stubben,
// lucide-react stubben, de actions vervangen door lib/test-actions). Dit blokje is daarom
// als eigen pure component afgesneden; het codebesluit zélf (staat dit nummer in de
// zichtbare catalogus?) wordt getoetst in lib/repo/products via articleCodeExists en het
// matchgedrag in lib/matching/engine.test.ts.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { RequestedArticleCode } from "./requested-article-code";

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

test("bekend nummer: alleen de code, geen melding", async () => {
  await renderServer(
    canvas(<RequestedArticleCode code="21012 0298" known />),
  );
  await expect.element(page.getByText("21012 0298")).toBeInTheDocument();
  expect(page.getByText(/not in our catalogue/).elements()).toHaveLength(0);
});

test("onbekend nummer: de code blijft staan, met de melding erbij", async () => {
  // Gemeten geval: 32812 9220 BRBB bestaat bij Delta Light, maar de hele LUNELLE-familie
  // ontbreekt in onze import. De tekstkandidaten blijven bruikbaar — dit is een melding,
  // geen blokkade.
  await renderServer(
    canvas(<RequestedArticleCode code="32812 9220 BRBB" known={false} />),
  );
  await expect.element(page.getByText("32812 9220 BRBB")).toBeInTheDocument();
  await expect.element(page.getByText(/not in our catalogue/)).toBeInTheDocument();
});

test("geen nummer gevraagd: niets tonen", async () => {
  // Een armaturenboek kent geen leveranciersnummers; dan hoort er geen leeg label te staan.
  await renderServer(canvas(<RequestedArticleCode code={null} known />));
  expect(page.getByText(/Article number/).elements()).toHaveLength(0);
});

// ── Opnamen ─────────────────────────────────────────────────────────────────

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`gevraagd artikelnummer: opname (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        canvas(
          <div className="space-y-4">
            <RequestedArticleCode code="21012 0298" known />
            <RequestedArticleCode code="32812 9220 BRBB" known={false} />
          </div>,
        ),
      );
      await expect.element(page.getByText(/not in our catalogue/)).toBeInTheDocument();
      await page.screenshot({
        path: `./requested-article-code.${theme}.${device}.test.png`,
      });
    });
  }
}
