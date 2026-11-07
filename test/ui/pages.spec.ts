// Every page renders at phone size without errors, passes the layout audit, and goes on the contact sheet.
import { audit, expect, open, openTrain, snap, test } from "./support";

test("search", async ({ page, errors }, info) => {
  await open(page, "/");
  await expect(page.locator("main h1")).toHaveText("Where are you catching a train?");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "01-search");
  void errors;
});

test("station suggestions", async ({ page, errors }, info) => {
  await open(page, "/");
  await page.locator("#station").fill("padd");
  await expect(page.locator("#station-list [role=option]").first()).toContainText("London Paddington");
  await snap(page, info, "02-suggestions");
  void errors;
});

test("board", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await expect(page.locator(".board__sub")).toContainText("Departures calling at Oxford, 09:00 to 10:00");
  await expect(page.locator(".trains__row").first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "03-board");
  void errors;
});

test("train", async ({ page, errors }, info) => {
  await openTrain(page);
  await expect(page.locator(".train__head h1")).toContainText("London Paddington to Oxford");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "04-train");
  void errors;
});

test("recent", async ({ page, errors }, info) => {
  await openTrain(page);
  await open(page, "/recent");
  await expect(page.locator(".recents__item")).toHaveCount(1);
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "05-recent");
  void errors;
});

test("settings", async ({ page, errors }, info) => {
  await open(page, "/settings");
  await expect(page.locator("#token")).toBeVisible(); // no key yet: the form is open
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "06-settings");
  void errors;
});

test("about", async ({ page, errors }, info) => {
  await open(page, "/about");
  await expect(page.locator("main h1")).toHaveText("About");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "07-about");
  void errors;
});

test("a problem is a sentence", async ({ page, errors }, info) => {
  await open(page, "/board?station=RDG&to=zzqqxx");
  await expect(page.locator(".problem")).toHaveText("Couldn't find a station called “zzqqxx”.");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "08-problem");
  void errors;
});
