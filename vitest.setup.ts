import { beforeAll, beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";
import "@/app/globals.css"; // Tailwind-styling in de screenshot-tests

beforeAll(() => {
  initialize();
});

beforeEach(async () => {
  await cleanup();
});
