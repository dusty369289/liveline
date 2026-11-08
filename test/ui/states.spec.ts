// Every state a person meets, on the contact sheet, so a review sees them all: returning search, boards (arrivals,
// empty, another day, changed platforms), a train before, during and after its run, Recent empty. The clock is fixed
// at 09:20 (support.ts), so each board time below picks a train in a known state.
import { readFileSync } from "node:fs";
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

test("board: changed platforms, confirmed and only expected", async ({ page, errors }, info) => {
  // A made-up key RTT "accepts", then a spec-derived board with all four platform states (its _note says which)
  const board = readFileSync("test/fixtures/rtt/spec_location_platform_changed.json", "utf8");
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

test("recent: nothing yet", async ({ page, errors }, info) => {
  await open(page, "/recent");
  await expect(page.locator(".empty")).toBeVisible();
  await shot(page, info, "17-recent-empty");
  void errors;
});
