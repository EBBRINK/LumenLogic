import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import Home from "./page";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`homepage rendert (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      }

      await renderServer(<Home />);

      await expect.element(document.body).toBeInTheDocument();
      await page.screenshot({
        path: `./page.${theme}.${device}.test.png`,
      });
    });
  }
}
