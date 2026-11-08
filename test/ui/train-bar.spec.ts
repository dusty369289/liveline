// The train page bar's messages with a key set, against a fake RTT: the bar says it short, the status region (what
// screen readers hear) says it in full. Demo mode can't show these: the simulator never fails or runs out.
import type { Page } from "@playwright/test";
import { SimTransport } from "../../src/core/simulator";
import { expect, MOMENT, openTrain, test } from "./support";

interface FakeRtt {
  /** Answer the next service calls with this status instead of the simulator's answer. */
  serviceStatus: number | null;
  /** What x-ratelimit-remaining-hour says on every answer (the simulator's own count when null). */
  hourLeft: number | null;
}

/** A saved key (made up), and RTT answered by the simulator at the suite's moment, with the faults a test asks for. */
async function keyedRtt(page: Page): Promise<FakeRtt> {
  const fake: FakeRtt = { serviceStatus: null, hourLeft: null };
  const started = Date.now();
  const sim = new SimTransport(() => MOMENT.getTime() + (Date.now() - started));
  await page.addInitScript(() => localStorage.setItem("rtt.key", "made-up-test-key-not-a-real-one"));
  await page.route("**/rtt/**", (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.replace(/^\/rtt/, "");
    if (path === "/api/info") {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ api_version: "2026-07-25", credentials: { entitlements: [] } }) });
    }
    const answer = sim.getSync(path, Object.fromEntries(url.searchParams));
    const headers = { ...answer.headers };
    if (fake.hourLeft != null) headers["x-ratelimit-remaining-hour"] = String(fake.hourLeft);
    if (path === "/gb-nr/service" && fake.serviceStatus != null) {
      return r.fulfill({ status: fake.serviceStatus, headers, contentType: "application/json", body: '{"error":"no"}' });
    }
    return r.fulfill({ status: answer.status, headers, contentType: "application/json", body: answer.body == null ? "" : JSON.stringify(answer.body) });
  });
  return fake;
}

test("a refresh that fails says so briefly in the bar, and why to screen readers", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  await openTrain(page);
  rtt.serviceStatus = 404; // the client throws on this even with an answer cached (a 5xx would show the cached one)
  await page.clock.fastForward(20_000); // past the 15 s a manual refresh waits while the hour has room
  await page.locator("[data-refresh-now]").click();
  await expect(page.locator("[data-age]")).toHaveText("Couldn't update. Trying again soon.");
  await expect(page.locator("[data-refresh-note]")).toHaveText("Couldn't update: Realtime Trains doesn't know that train.");
  void errors;
});

test("refresh with only the search calls left says so briefly in the bar, and in full to screen readers", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  rtt.hourLeft = 10; // exactly the reserve kept for searches (Budget.reserve)
  await openTrain(page);
  await page.locator("[data-refresh-now]").click();
  await expect(page.locator("[data-age]")).toHaveText("Only search calls are left this hour");
  await expect(page.locator("[data-refresh-note]")).toHaveText("Only the calls kept for searches are left this hour. Showing the last answer.");
  void errors;
});
