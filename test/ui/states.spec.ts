// Every state a person meets, on the contact sheet, so a review sees them all: returning search, boards (arrivals,
// empty, another day), a train before, during and after its run, Recent empty. The clock is fixed at 09:20
// (support.ts), so each board time below picks a train in a known state.
import type { Page, TestInfo } from "@playwright/test";
import { audit, expect, open, snap, test } from "./support";

async function firstTrain(page: Page, hash: string): Promise<void> {
  await open(page, hash);
  await page.locator(".trains__link").first().click();
  await page.locator("[data-trainbar]").waitFor();
  await page.waitForTimeout(300);
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  expect(await audit(page)).toEqual([]);
  await snap(page, info, name);
}

test("search, returning: a saved journey, a train to carry on with, recent stations", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await page.locator("[data-save-journey]").click();
  await firstTrain(page, "/board?station=PAD&to=OXF&time=09:00");
  await open(page, "/");
  await expect(page.locator(".carry")).toBeVisible();
  await expect(page.locator(".journeys__item")).toHaveCount(1);
  await shot(page, info, "10-search-returning");
  void errors;
});

test("board: arrivals", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&mode=arr&time=09:00");
  await expect(page.locator(".board__sub")).toContainText("Arrivals");
  await shot(page, info, "11-board-arrivals");
  void errors;
});

test("board: nothing in the hour", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&to=OXF&time=02:00");
  await expect(page.locator(".empty")).toBeVisible();
  await shot(page, info, "12-board-empty");
  void errors;
});

test("board: another day", async ({ page, errors }, info) => {
  await open(page, "/board?station=WAT&time=08:00&day=2026-11-09");
  await expect(page.locator(".board__sub")).toContainText("Mon 9 Nov");
  await shot(page, info, "13-board-another-day");
  void errors;
});

test("train: not left yet", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=PAD&to=OXF&time=09:30");
  await expect(page.locator(".live")).toHaveAttribute("data-state", "not-started");
  await shot(page, info, "14-train-not-started");
  void errors;
});

test("train: on its way, as seen after Jump to train", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=PAD&to=OXF&time=09:00");
  await expect(page.locator(".live")).toHaveAttribute("data-state", /running|overdue|at-station/);
  expect(await audit(page)).toEqual([]);
  await page.locator("[data-jump]").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `.ui-report/${info.project.name}/15-train-running-view.png` });
  void errors;
});

test("train: arrived", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=PAD&to=OXF&time=07:00");
  await expect(page.locator(".live")).toHaveAttribute("data-state", "arrived");
  await shot(page, info, "16-train-arrived");
  void errors;
});

test("settings: a key Realtime Trains refused, said above the page", async ({ page, errors }, info) => {
  await open(page, "/settings");
  await page.locator("#token").fill("x".repeat(40));
  await page.locator("[data-key-form] button[type=submit]").click();
  await expect(page.locator("[data-flash]")).toContainText("refused the key");
  await shot(page, info, "18-settings-key-refused");
  void errors;
});

test("waiting for Realtime Trains: the old page stays, with a thin line along the top", async ({ page, errors }, info) => {
  // A made-up key (never a real one), so the board asks the faked RTT, which holds its answer until told
  await page.addInitScript(() => localStorage.setItem("rtt.key", "made-up-key-for-tests-only-0123456789"));
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/rtt/**", async (r) => {
    await held;
    await r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"no"}' });
  });
  await open(page, "/recent");
  await page.evaluate(() => (location.hash = "#/board?station=PAD&time=09:00"));
  await expect(page.locator("#app")).toHaveClass(/is-navigating/);
  await page.waitForTimeout(500); // the line shows after 300 ms, so a quick answer doesn't flicker
  await page.screenshot({ path: `.ui-report/${info.project.name}/19-loading.png` }); // the screen, where the line is
  release();
  await page.locator("main h1").waitFor();
  void errors;
});

test("something nobody planned for: a sentence and Try again, not Loading… for good", async ({ page, errors }, info) => {
  // A saved-journeys list no version of the app would write: drawing the search page throws, standing for any bug
  await page.addInitScript(() => localStorage.setItem("liveline.journeys", "[null]"));
  await open(page, "/");
  await expect(page.locator("main h1")).toHaveText("Something went wrong");
  await expect(page.locator("[data-retry]")).toHaveText("Try again");
  await shot(page, info, "19-something-went-wrong");
  // The app logs the bug for a report: expected here, and nothing else may be in the list
  expect(errors.filter((e) => !e.startsWith("console:"))).toEqual([]);
  errors.length = 0;
});

test("recent: nothing yet",async ({ page, errors }, info) => {
  await open(page, "/recent");
  await expect(page.locator(".empty")).toBeVisible();
  await shot(page, info, "17-recent-empty");
  void errors;
});
