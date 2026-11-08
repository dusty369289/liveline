// Every page renders at phone size without errors, passes the layout audit, and goes on the contact sheet.
import { audit, expect, largeText, open, openTrain, snap, test } from "./support";

test("search", async ({ page, errors }, info) => {
  await open(page, "/");
  await expect(page.locator("main h1")).toHaveText("Find your train");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "01-search");
  void errors;
});

test("station suggestions", async ({ page, errors }, info) => {
  await open(page, "/");
  await page.locator("#station").fill("padd");
  await expect(page.locator("#station-list [role=option]").first()).toContainText("London Paddington");
  // The list ends with a firm ink rule, so it doesn't run into the field below it
  const end = await page.locator("#station-list").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { width: cs.borderBottomWidth, ink: cs.borderBottomColor === getComputedStyle(document.body).color };
  });
  expect(end).toEqual({ width: "2px", ink: true });
  await snap(page, info, "02-suggestions");
  void errors;
});

test("board", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await expect(page.locator(".board__sub")).toContainText("Departures calling at Oxford · 09:00 to 10:00");
  await expect(page.locator(".trains__row").first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "03-board");
  void errors;
});

test("board at large system text (200%): every row keeps its time, destination and platform on screen", async ({ page, errors }, info) => {
  await largeText(page);
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await expect(page.locator(".trains__row").first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
  // The destination gets room to be read, not squeezed to nothing between the time and the plate
  const narrow = await page.locator(".trains__place").evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().width).filter((w) => w < 80));
  expect(narrow).toEqual([]);
  await snap(page, info, "25-board-large-text");
  void errors;
});

test("train", async ({ page, errors }, info) => {
  await openTrain(page);
  await expect(page.locator(".train__head h1")).toContainText("London Paddington to Oxford");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "04-train");
  void errors;
});

test("route at large system text (200%): names and times fit the screen", async ({ page, errors }, info) => {
  await largeText(page);
  await openTrain(page);
  await expect(page.getByRole("tab", { name: "Route" })).toHaveAttribute("aria-selected", "true");
  expect(await audit(page)).toEqual([]);
  const narrow = await page.locator(".is-call .route__place").evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().width).filter((w) => w < 80));
  expect(narrow).toEqual([]);
  // "Train view" wraps here: its last line sits on Route's line, and both underlines along the same foot
  const tabs = await page.getByRole("tab").evaluateAll((els) => els.map((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const lines = r.getClientRects();
    return { text: Math.round(lines[lines.length - 1].bottom), foot: Math.round(el.getBoundingClientRect().bottom) };
  }));
  expect(new Set(tabs.map((t) => t.text)).size, JSON.stringify(tabs)).toBe(1);
  expect(new Set(tabs.map((t) => t.foot)).size, JSON.stringify(tabs)).toBe(1);
  await snap(page, info, "26-route-large-text");
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
