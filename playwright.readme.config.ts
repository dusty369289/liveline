// The README's pictures, from the built app in demo mode at the test suite's fixed moment: `npm run readme-pictures`.
// Not a test run: it writes docs/img/*.png, light and dark. No network, as in the tests (test/ui/support.ts).
import { defineConfig, devices } from "@playwright/test";

const PORT = 4181;
const phone = { ...devices["Pixel 7"], viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: "test/readme",
  testMatch: "*.pictures.ts",
  timeout: 20_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "en-GB", timezoneId: "Europe/London" },
  projects: [
    { name: "light", use: { ...phone, colorScheme: "light" } },
    { name: "dark", use: { ...phone, colorScheme: "dark" } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
