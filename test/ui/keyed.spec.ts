// With a key (a dummy one, never a real key): RTT is faked from a recording and every board call is counted, so the
// "now" board's own refreshing is held to its allowance: a round every 2 minutes for 15 minutes, nothing while the app
// is hidden, and the last answer kept when RTT asks us to slow down.
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expect, open, test } from "./support";

const ROUND = 120_000; // BOARD_REFRESH.every
const FOR = 15 * 60_000; // BOARD_REFRESH.for
const BOARD = readFileSync(new URL("../fixtures/rtt/real_location_RDG_20261107-1526.json", import.meta.url), "utf8");

/** Seed a dummy key and fake RTT; returns how many board calls reached it. */
async function keyed(page: Page): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.addInitScript(() => localStorage.setItem("rtt.key", "dummy-key-for-browser-tests-only"));
  await page.route(/\/rtt\/api\/info/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"api_version":"2026-07-25"}' }));
  await page.route(/\/rtt\/gb-nr\/location/, (r) => {
    calls += 1;
    return r.fulfill({ status: 200, contentType: "application/json", body: BOARD });
  });
  return { calls: () => calls };
}

const hide = (page: Page, hidden: boolean) => page.evaluate((h) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);

test("a now board asks again each round once its answer is old, and stops after 15 minutes", async ({ page, errors }) => {
  const rtt = await keyed(page);
  await open(page, "/board?station=RDG");
  expect(rtt.calls()).toBe(1);
  for (let round = 1; round * ROUND <= FOR; round++) {
    await page.clock.runFor(ROUND);
    await expect.poll(rtt.calls).toBe(round + 1);
  }
  await page.clock.runFor(ROUND);
  await expect(page.locator(".board__foot")).toContainText("Stopped updating");
  await page.clock.runFor(5 * ROUND);
  expect(rtt.calls()).toBe(Math.floor(FOR / ROUND) + 1); // the first answer, then 7 rounds
  void errors;
});

test("a now board asks nothing while hidden, and once on coming back", async ({ page, errors }) => {
  const rtt = await keyed(page);
  await open(page, "/board?station=RDG");
  await hide(page, true);
  for (let i = 0; i < 3; i++) await page.clock.runFor(ROUND);
  expect(rtt.calls()).toBe(1);
  await hide(page, false);
  await expect.poll(rtt.calls).toBe(2);
  void errors;
});

test("when RTT asks us to slow down, the board keeps its last answer and its time", async ({ page, errors }) => {
  await keyed(page);
  await open(page, "/board?station=RDG");
  let refused = 0;
  await page.route(/\/rtt\/gb-nr\/location/, (r) => {
    refused += 1;
    return r.fulfill({ status: 429, contentType: "application/json", body: "{}" });
  });
  await page.clock.runFor(ROUND);
  await expect.poll(() => refused).toBe(1);
  await expect(page.locator("main h1")).toContainText("Reading");
  await expect(page.locator(".board__foot")).toContainText("Updated 09:20"); // the answer shown is still the first one
  void errors;
});
