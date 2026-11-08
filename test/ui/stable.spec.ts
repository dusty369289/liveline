// Opening or closing something never moves what's above it (owner, 2026-11-08: opening "Another time or day" pushed
// the whole search page up, with the tabs at the bottom). The page may grow downwards, and nothing more.
import type { Locator, Page } from "@playwright/test";
import { KEYS } from "../../src/ui/store/keys";
import { expect, open, openTrain, test } from "./support";

/** Where every control and heading above `toggle` sits on the page (not the screen: scrolling is allowed). */
const above = (toggle: Locator) => toggle.evaluate((t) => {
  const top = t.getBoundingClientRect().top;
  return [...document.querySelectorAll<HTMLElement>("main h1, main h2, main a, main button, main input, main summary")]
    .filter((el) => el.offsetParent && el.getBoundingClientRect().bottom <= top && !t.contains(el))
    .map((el) => `${el.tagName} ${(el.textContent || (el as HTMLInputElement).id).trim().slice(0, 24)} @ ${Math.round(el.getBoundingClientRect().top + scrollY)}`);
});

/** Open `toggle`, then close it: nothing above it moves either time. */
async function stillAbove(page: Page, toggle: Locator): Promise<void> {
  const before = await above(toggle);
  expect(before.length, "something above the toggle to watch").toBeGreaterThan(0);
  for (const step of ["opened", "closed again"]) {
    await toggle.click();
    await page.waitForTimeout(50);
    expect(await above(toggle), `nothing above it moves when ${step}`).toEqual(before);
  }
}

test("the search page: Another time or day moves nothing above it", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await page.locator("[data-save-journey]").click(); // a saved journey line, so there's more to watch
  await open(page, "/");
  const fold = page.locator(".search__when summary");
  if (await fold.isVisible()) await stillAbove(page, fold);
  else await expect(page.locator("#time")).toBeVisible(); // a tall screen shows the time and day already: nothing opens
  void errors;
});

test("with the tabs at the top, the search page's fold opens and moves nothing above it", async ({ page, errors }) => {
  await page.addInitScript((name) => localStorage.setItem(name, JSON.stringify("top")), KEYS.tabs);
  await open(page, "/");
  await stillAbove(page, page.locator(".search__when summary"));
  void errors;
});

test("the train page: a passing-points fold moves nothing above it", async ({ page, errors }) => {
  await openTrain(page);
  await stillAbove(page, page.locator("[data-fold-toggle]").last());
  void errors;
});
