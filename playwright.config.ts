import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against the dev server with seeded demo data (`npm run db:seed`). Locally they use
 * your installed Chrome; CI installs Playwright's Chromium. Run with `npm run e2e`.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false, // tests share one database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) } }],
  webServer: { command: `npx next dev -p ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 180_000 },
});
