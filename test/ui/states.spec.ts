// Every state a person meets, on the contact sheet, so a review sees them all: returning search, boards (arrivals,
// empty, another day), a train on another day, a train before, during and after its run, Recent empty. The clock is
// fixed at 09:20 (support.ts), so each board time below picks a train in a known state.
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

test("train: another day, opened from that board", async ({ page, errors }, info) => {
  await firstTrain(page, "/board?station=WAT&time=08:00&day=2026-11-09");
  await expect(page.locator(".train__head h1")).toContainText("Mon 9 Nov");
  await expect(page.locator(".live__hero")).toContainText("Mon 9 Nov");
  await expect(page.locator(".live__hero")).not.toContainText("min");
  await shot(page, info, "13b-train-another-day");
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
