import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // .claude/worktrees bevat kopieën van de repo (parallelle agents) — die
    // testbestanden horen niet bij deze run en zijn bovendien in beweging.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
