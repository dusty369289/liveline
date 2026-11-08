// Every state a person meets, on the contact sheet, so a review sees them all: returning search, boards (arrivals,
// empty, another day, changed platforms), a train on another day, a train before, during and after its run, Recent
// empty. The clock is fixed at 09:20 (support.ts), so each board time below picks a train in a known state.
import { readFileSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { KEYS } from "../../src/ui/store/keys";
import { audit, expect, open, seedKey, snap, test } from "./support";

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
  await expect(page.locator(".trains__place").first()).toContainText(/^from \S/);
  await shot(page, info, "11-board-arrivals");
  void errors;
});

test("board: nothing in the hour", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&to=OXF&time=02:00");
  await expect(page.locator(".empty")).toBeVisible();
  await shot(page, info, "12-board-empty");
  void errors;
});

// Its sub-line ("… on Sun 8 Nov", with a calling-at station) wraps to two lines at 360 px. The space under the nameboard
// must not depend on the line being short enough to centre inside the 44 px link.
test("board: a wrapped sub-line keeps its space under the nameboard", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=02:00");
  const gap = await page.evaluate(() => {
    const plate = document.querySelector(".board__plate")!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(".board__sub a")!);
    const lines = [...range.getClientRects()].filter((r) => r.height > 0);
    return { gap: Math.min(...lines.map((r) => r.top)) - plate.bottom, lines: new Set(lines.map((r) => Math.round(r.top))).size };
  });
  if ((page.viewportSize()?.width ?? 0) <= 360) expect(gap.lines).toBeGreaterThan(1); // the case this guards
  expect(gap.gap).toBeGreaterThanOrEqual(12);
  void errors;
});

test("board: another day", async ({ page, errors }, info) => {
  await open(page, "/board?station=WAT&time=08:00&day=2026-11-09");
  await expect(page.locator(".board__sub")).toContainText("Mon 9 Nov");
  await shot(page, info, "13-board-another-day");
  void errors;
});

test("train: another day, opened from that board", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=WAT&time=08:00&day=2026-11-09");
  await expect(page.locator(".train__head h1")).toContainText("Mon 9 Nov");
  await expect(page.locator(".live__hero-num")).toHaveText(/^08:\d\d$/);
  await expect(page.locator(".live__hero")).not.toContainText("min");
  await shot(page, info, "13b-train-another-day");
  void errors;
});

test("train: another day, opened with where you get off", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=WAT&to=WOK&time=08:00&day=2026-11-09");
  await expect(page.locator(".live__stop").first()).toContainText("It reaches Woking at");
  await expect(page.locator(".live__status")).not.toContainText(/in \d+ min/);
  await expect(page.locator("main")).toContainText("Mon 9 Nov");
  expect((await page.locator("main").innerText()).match(/Mon 9 Nov/g)).toHaveLength(1);
  await shot(page, info, "13c-train-another-day-both-stops");
  void errors;
});

test("board: changed platforms, confirmed and only expected", async ({ page, errors }, info) => {
  // A made-up key RTT "accepts", then a spec-derived board with all four platform states (its _note says which)
  const board = readFileSync("test/fixtures/rtt/spec_location_platform_states.json", "utf8");
  const info200 = '{"api_version":"2026-07-25","credentials":{"entitlements":[]}}';
  await page.route(/\/rtt\/api\/info\?/, (r) => r.fulfill({ contentType: "application/json", body: info200 }));
  await page.route(/\/rtt\/gb-nr\/location\?/, (r) => r.fulfill({ contentType: "application/json", body: board }));
  await open(page, "/settings");
  await page.locator("#token").fill("x".repeat(40));
  await page.locator("[data-key-form] button[type=submit]").click();
  await expect(page.locator(".banner--demo")).toHaveCount(0);
  await open(page, "/board?station=RDG&time=09:15");
  const row = (dest: string) => page.locator(".trains__row", { hasText: dest });
  for (const dest of ["Bristol Temple Meads", "Manchester Piccadilly"]) {
    await expect(row(dest).locator(".trains__meta")).toContainText(/Platform\schanged/);
  }
  // What the browser really paints, whatever order the stylesheets come in: white on the navy plate, ink when outlined
  const style = (dest: string) => row(dest).locator(".trains__plat").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, shadow: cs.boxShadow };
  });
  expect((await style("Bristol Temple Meads")).color).toBe("rgb(255, 255, 255)");
  expect((await style("Manchester Piccadilly")).shadow).toMatch(/rgb\(255, 204, 0\)/); // keeps the yellow bar
  await shot(page, info, "18-board-platform-changed");
  void errors;
});

test("train: not left yet", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=PAD&to=OXF&time=09:30");
  await expect(page.locator(".live")).toHaveAttribute("data-state", "not-started");
  await shot(page, info, "14-train-not-started");
  void errors;
});

test("train: not left yet, so none of the line is inked as travelled", async ({ page, errors }) => {
  await firstTrain(page, "/board?station=PAD&to=OXF&time=09:30");
  const done = await page.locator(".route__done").boundingBox();
  expect(done?.height ?? 0).toBeLessThan(1);
  void errors;
});

test("train: the travelled ink starts at the first stop and sits on the line's centre", async ({ page, errors }) => {
  await firstTrain(page, "/board?station=PAD&to=OXF&time=09:00");
  const done = (await page.locator(".route__done").boundingBox())!;
  const mark = (await page.locator(".route__pt").first().locator(".route__mark").boundingBox())!;
  expect(Math.abs(done.x + done.width / 2 - (mark.x + mark.width / 2))).toBeLessThan(0.5);
  expect(Math.abs(done.y - (mark.y + mark.height / 2))).toBeLessThan(1);
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

test("settings: a key Realtime Trains refused, said under its field", async ({ page, errors }, info) => {
  await open(page, "/settings");
  await page.locator("#token").fill("x".repeat(40));
  await page.locator("[data-key-form] button[type=submit]").click();
  await expect(page.locator("#token-error")).toContainText("didn't accept that key"); // under its field, not in the flash
  await shot(page, info, "18-settings-key-refused");
  void errors;
});

test("waiting for Realtime Trains: the old page stays, with a thin line along the top", async ({ page, errors }, info) => {
  // A made-up key (never a real one), so the board asks the faked RTT, which holds its answer until told
  await seedKey(page);
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
  await page.addInitScript((name) => localStorage.setItem(name, "[null]"), KEYS.journeys);
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
