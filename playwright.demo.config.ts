import { defineConfig, devices } from "@playwright/test";

/**
 * Demo-path Playwright config.
 *
 * Run with:
 *   npx playwright test -c playwright.demo.config.ts
 *
 * Override the base URL for prod smoke tests:
 *   DEMO_BASE_URL=https://tutorroom.ai npx playwright test -c playwright.demo.config.ts
 */

const baseURL =
  process.env.DEMO_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  testMatch: /demo-path\.spec\.ts/,

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    /* Give enough time for AI streaming responses. */
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  /* Per-test timeout: the homework generation step can take ~3 min. */
  timeout: 300_000,
  expect: {
    timeout: 30_000,
  },

  projects: [
    {
      name: "demo-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /*
   * Do NOT declare a webServer here — we reuse the already-running dev server
   * (or a prod URL). The caller is responsible for starting the server before
   * running this suite.
   */
});
