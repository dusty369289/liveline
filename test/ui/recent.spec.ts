// Recent with the tabs at the bottom of a tall screen (owner, 2026-11-09): the newest train at the foot, just above the
// tabs, where the thumb is, and older ones a scroll up. Screen readers still meet the newest first.
import type { Page } from "@playwright/test";
import { fromLondon } from "../../src/core/time";
import { KEYS } from "../../src/ui/store/keys";
import { expect, ONCE, open, test } from "./support";

const at = (h: number, m: number) => fromLondon(2026, 11, 7, h, m);
const seed = (page: Page, n: number) => {
  const trains = Array.from({ length: n }, (_, i) => ({
    href: `#/train/R${i}:2026-11-07`, title: `Train ${i}`, starts: at(8 - i, 0), ends: at(8 - i, 30), seen: at(9, 10) - i * 60_000,
  })); // newest first, as the store keeps them
  return page.addInitScript(([name, v]) => localStorage.setItem(name, v), [KEYS.trains, JSON.stringify(trains)] as const);
};
const rows = (page: Page) => page.locator(".recents__item").evaluateAll((els) =>
  els.map((el) => ({ title: el.querySelector(".recents__title")!.textContent, top: el.getBoundingClientRect().top,
    bottom: el.getBoundingClientRect().bottom })));
const tabsTop = (page: Page) => page.locator(".topbar__nav").evaluate((el) => el.getBoundingClientRect().top);

test("with the tabs at the bottom, the newest train is at the foot, on screen just above the tabs", ONCE, async ({ page, errors }) => {
  await seed(page, 12);
  await open(page, "/recent");
  const list = await rows(page);
  expect(list[0].title).toBe("Train 0"); // the newest first in the page, as a screen reader reads it
  expect(list[0].top).toBeGreaterThan(list[11].top); // and drawn last, at the foot
  const tabs = await tabsTop(page);
  expect(list[0].bottom).toBeLessThanOrEqual(tabs); // on screen as the page opens
  expect(list[0].bottom).toBeGreaterThan(tabs - 200); // just above the tabs
  void errors;
});

test("a short list sits low too, not at the top with the room below it", ONCE, async ({ page, errors }) => {
  await seed(page, 2);
  await open(page, "/recent");
  const list = await rows(page);
  expect(list[0].bottom).toBeGreaterThan((await tabsTop(page)) - 200);
  void errors;
});

test("with the tabs at the top, the newest train is first, at the top, as before", ONCE, async ({ page, errors }) => {
  await page.addInitScript((name) => localStorage.setItem(name, JSON.stringify("top")), KEYS.tabs);
  await seed(page, 12);
  await open(page, "/recent");
  const list = await rows(page);
  expect(list[0].top).toBeLessThan(list[11].top);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  void errors;
});
