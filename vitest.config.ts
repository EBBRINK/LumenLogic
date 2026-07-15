import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

const tslibEs6 = fileURLToPath(
  new URL("./node_modules/tslib/tslib.es6.js", import.meta.url),
);

export default defineConfig({
  plugins: [
    {
      name: "pdf-lib-tslib-es6",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "tslib" && importer?.includes("node_modules/pdf-lib")) {
          return tslibEs6;
        }
      },
    },
    vitestPluginRSC(),
    vitestPluginNext(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // pdf-lib hangt op tslib v1; de CJS/ESM-wrapper daarvan (modules/index.js) breekt in
  // de browser-tests. Alleen vóór pdf-lib wijzen we tslib naar de ES-module-build —
  // andere pakketten (react-remove-scroll e.d.) houden hun eigen (geneste) tslib v2.
  // pako (CJS-dep van pdf-lib) moet wél door de optimizer voor een default-export.
  optimizeDeps: { exclude: ["pdf-lib"], include: ["pako"] },
  test: {
    // .claude/worktrees én .worktrees/ bevatten kopieën van de repo (parallelle
    // agents/branches) — die testbestanden horen niet bij deze run en zijn
    // bovendien in beweging.
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/.worktrees/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
