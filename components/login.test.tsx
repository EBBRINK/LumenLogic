// Het inlogformulier na de verhuizing uit app/login/page.tsx (UX-audit bug #7): de
// pagina is nu een serverwrapper met een sessiecheck, het formulier zelf is onveranderd.
// Deze tests pinnen dat de verhuizing niets sloopte, plus licht/donker × mobiel/desktop.
// De poort zelf staat in app/login/login-gate.test.ts — die heeft een vi.mock nodig en
// die verdraagt zich niet met het renderen van een client-component in dezelfde run.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { LoginForm } from "./login-form";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

test("formulier: e-mailveld verplicht en één knop die de magic link stuurt", async () => {
  await renderServer(<LoginForm />);
  await expect
    .element(page.getByRole("button", { name: "Send magic link" }))
    .toBeInTheDocument();
  const veld = document.querySelector<HTMLInputElement>('input[type="email"]');
  expect(veld).not.toBeNull();
  expect(veld?.required).toBe(true);
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`inloggen (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(
        <div className="min-h-screen bg-background text-foreground">
          <LoginForm />
        </div>,
      );
      await expect
        .element(page.getByRole("button", { name: "Send magic link" }))
        .toBeInTheDocument();
      await page.screenshot({ path: `./login.${theme}.${device}.test.png` });
    });
  }
}
