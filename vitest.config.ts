/**
 * Vitest configuration: the same test files run in four projects (docs/development.md,
 * *Tests*). The suffix of a file says where it runs: `*.test.ts` everywhere,
 * `*.node.test.ts` in Node.js only, `*.chromium.test.ts` in Chromium only.
 */
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const tests = "test/**/*.test.ts";
const nodeOnly = "test/**/*.node.test.ts";
const chromiumOnly = "test/**/*.chromium.test.ts";

function browserProject(name: "chromium" | "firefox" | "webkit", exclude: string[]) {
  return {
    test: {
      name,
      include: [tests],
      exclude,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: name }],
      },
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      { test: { name: "node", environment: "node", include: [tests], exclude: [chromiumOnly] } },
      browserProject("chromium", [nodeOnly]),
      browserProject("firefox", [nodeOnly, chromiumOnly]),
      browserProject("webkit", [nodeOnly, chromiumOnly]),
    ],
  },
});
