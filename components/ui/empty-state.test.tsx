// White-box RSC-render/screenshottests van de gedeelde lege toestand (UX-audit 30 jul,
// A6). De audit vond vijf dialecten voor "hier staat niets"; dit component is de enige
// die er nog mag zijn. De tests pinnen de twee dingen vast waarop de dialecten uiteen
// liepen: WIE tekent het kader ("framed" vs "inline") en of er een actie ís.
// Licht/donker × mobiel/desktop.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { EmptyState } from "./empty-state";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <main className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

const gallery = (
  <Screen>
    <EmptyState
      title="No versions saved yet."
      description="Save the first version once the luminaire schedule is ready for the construction site."
      action={
        <form action="/noop">
          <Button type="submit" size="sm">
            Save new version
          </Button>
        </form>
      }
    />
    <EmptyState
      title="Nothing to review — all lines are unambiguous."
      description="Lines only appear here when a human verdict is needed."
      action={null}
    />
    <Card>
      <CardHeader>
        <CardTitle>Pending uploads</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState variant="inline" title="No pending uploads." action={null} />
      </CardContent>
    </Card>
  </Screen>
);

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`empty-state (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(gallery);
      await expect
        .element(page.getByText("No versions saved yet."))
        .toBeInTheDocument();
      await page.screenshot({ path: `./empty-state.${theme}.${device}.test.png` });
    });
  }
}

test("framed tekent zijn eigen gestreepte kader; inline nooit", async () => {
  await renderServer(gallery);
  await expect
    .element(page.getByText("No pending uploads."))
    .toBeInTheDocument();

  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]'),
  );
  expect(all).toHaveLength(3);

  const framed = all.filter((e) => e.dataset.variant === "framed");
  const inline = all.filter((e) => e.dataset.variant === "inline");
  expect(framed).toHaveLength(2);
  expect(inline).toHaveLength(1);

  for (const el of framed) {
    expect(el.className).toContain("border-dashed");
  }
  // Kader binnen een kader is precies de fout die dialect 4 opleverde: de inline-variant
  // tekent daarom niets, want zijn <Card> doet dat al.
  expect(inline[0].className).not.toContain("border-dashed");
  expect(inline[0].closest('[data-slot="card"]')).not.toBeNull();
});

test("de actie-slot rendert de knop; action={null} laat geen leeg blok achter", async () => {
  await renderServer(gallery);
  await expect
    .element(page.getByRole("button", { name: "Save new version" }))
    .toBeInTheDocument();

  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="empty-state"]'),
  );
  const withAction = all.filter((e) => e.querySelector("form"));
  expect(withAction).toHaveLength(1);
  // De twee bewuste `action={null}`-gevallen hebben precies twee kinderen (titel +
  // uitleg) resp. één (alleen titel) — geen lege actie-container.
  const zonder = all.filter((e) => !e.querySelector("form"));
  expect(zonder.map((e) => e.children.length)).toEqual([2, 1]);
});
