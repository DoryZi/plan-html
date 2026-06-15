import { defineConfig, devices } from "@playwright/test";

// The deck server (serve_plan.py) picks its own random port and logs it on
// stderr, so we can't use Playwright's `webServer` (it needs a fixed URL).
// Instead each test starts the server via the `deck` fixture (see
// tests/e2e/fixtures.js) and navigates to the captured URL.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? "list" : "list",
  use: { ...devices["Desktop Chrome"], headless: true },
});
