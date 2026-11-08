// Browser tests: the built app at phone sizes, light and dark. `npm run test:ui`, then open .ui-report/index.html.
// Never touches the network (test/ui/support.ts fakes RTT and GitHub). No retries: a flaky test is a bug to explain.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4180;

export default defineConfig({
  testDir: "test/ui",
  testMatch: "*.spec.ts",
  timeout: 10_000, // per test, the same hard limit as the unit tests
  expect: { timeout: 3_000 },
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // the review reporter records outcomes and times, so a fail then a pass is listed as flaky (test/harness/review.ts)
  // Locally a dot per test, failures in full and the summary (a passing run is a few lines, which is what an agent
  // reads back); CI keeps the per-test list in its log. `--reporter=list` for it here.
  reporter: [[process.env.CI ? "list" : "dot"], ["./test/ui/contact-sheet.ts"], ["./test/harness/review-playwright.ts"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-GB",
    timezoneId: "Europe/London",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone-360-light", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 800 }, colorScheme: "light" } },
    // Looks are checked at both sizes; behaviour once (test/ui/support.ts, ONCE): the same code runs at every size
    // and theme, so a second run only costs time. These files test behaviour throughout, so they're left out whole.
    {
      name: "phone-412-dark", use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, colorScheme: "dark" },
      grepInvert: /@once/,
      testIgnore: ["calls.spec.ts", "focus.spec.ts", "train-bar.spec.ts", "calm.spec.ts", "flip.spec.ts"],
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
