// With a key (a dummy one, never a real key): RTT is faked from a recording and every board call is counted, so the
// "now" board's own refreshing is held to its allowance: a round every 2 minutes for 15 minutes, nothing while the app
// is hidden, and the last answer kept, plainly marked as older, when RTT asks us to slow down.
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { audit, expect, open, snap, test } from "./support";

const ROUND = 120_000; // BOARD_REFRESH.every
const FOR = 15 * 60_000; // BOARD_REFRESH.for
const BOARD = readFileSync(new URL("../fixtures/rtt/real_location_RDG_20261107-1526.json", import.meta.url), "utf8");

/** When the recording was made (UK time = UTC in November): the board's rows fall in a "now" board's hour from here. */
const RECORDED = new Date("2026-11-07T15:26:00Z");

/** Seed a dummy key, set the clock to the recording's time and fake RTT; returns how many board calls reached it. */
async function keyed(page: Page): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.clock.setSystemTime(RECORDED);
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

/**
 * Move the page's clock on, then wait a moment of real time: a call the round started is asynchronous, so counting at
 * once would miss it, and "nothing more was asked" can only be seen after giving it the chance.
 */
async function after(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
  await page.waitForTimeout(SETTLE);
}
const SETTLE = 400;

/**
 * Run a step that refreshes the board, and wait until the page has drawn the answer: until then the refresh is still
 * busy, and a round the clock reaches meanwhile is skipped. A refresh replaces the body, so the marked foot goes.
 */
async function redrawn(page: Page, step: () => Promise<void>): Promise<void> {
  await page.locator(".board__foot").evaluate((e) => e.setAttribute("data-drawn-before", ""));
  await step();
  await expect(page.locator(".board__foot:not([data-drawn-before])")).toHaveCount(1);
}

test("a now board asks again each round once its answer is old, and stops after 15 minutes", async ({ page, errors }) => {
  const rtt = await keyed(page);
  await open(page, "/board?station=RDG");
  expect(rtt.calls()).toBe(1);
  for (let round = 1; round * ROUND <= FOR; round++) {
    await redrawn(page, () => page.clock.runFor(ROUND));
    expect(rtt.calls()).toBe(round + 1);
  }
  await page.clock.runFor(ROUND);
  await expect(page.locator(".board__foot")).toContainText("Stopped updating");
  await after(page, 5 * ROUND); // settled: an extra call in any round above would show here
  expect(rtt.calls()).toBe(Math.floor(FOR / ROUND) + 1); // the first answer, then 7 rounds
  void errors;
});

test("a now board asks nothing while hidden, and once on coming back, even just before a round", async ({ page, errors }) => {
  const rtt = await keyed(page);
  await open(page, "/board?station=RDG");
  await hide(page, true);
  // Back 90 s before a round: older than the client keeps a board (a minute), so a second ask would reach RTT
  await after(page, 3 * ROUND - 90_000);
  expect(rtt.calls()).toBe(1);
  await redrawn(page, () => hide(page, false));
  expect(rtt.calls()).toBe(2);
  await after(page, 100_000); // the round comes 90 s after that answer: too soon to ask again
  expect(rtt.calls()).toBe(2);
  await after(page, ROUND); // the next round: the answer is old again
  expect(rtt.calls()).toBe(3);
  void errors;
});

test("when RTT asks us to slow down, the board keeps its last answer and says how old it is", async ({ page, errors }, info) => {
  await keyed(page);
  await open(page, "/board?station=RDG");
  const rows = await page.locator(".trains__row").count();
  expect(rows).toBeGreaterThan(5); // the recording's trains, so "kept" means something
  let refused = 0;
  await page.route(/\/rtt\/gb-nr\/location/, (r) => {
    refused += 1;
    return r.fulfill({ status: 429, contentType: "application/json", body: "{}" });
  });
  await redrawn(page, () => page.clock.runFor(ROUND));
  expect(refused).toBe(1);
  await expect(page.locator("main h1")).toContainText("Reading");
  await expect(page.locator(".trains__row")).toHaveCount(rows); // the answer shown is still the first one
  await expect(page.locator(".board__foot")).toContainText("Updated 15:26");
  await expect(page.locator("[data-board-body]")).toContainText("Showing the answer from 2 min ago. Not updated: Realtime Trains asked us to slow down.");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "board-older-answer");
  void errors;
});
