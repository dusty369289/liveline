// Where the tabs sit: along the foot of a tall screen by default, at the top if chosen in Settings, and at the top on a
// short screen whatever was chosen (owner, 2026-11-08). The bar never hides the page: its last line clears it.
import { expect, open, test } from "./support";

const navBox = (page: import("@playwright/test").Page) =>
  page.locator(".topbar__nav").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: innerHeight };
  });

test("the tabs sit along the foot of a tall screen, each its icon and word, and the page clears them", async ({ page, errors }) => {
  await open(page, "/recent");
  const box = await navBox(page);
  expect(box.bottom).toBe(box.height);
  expect((await page.getByRole("link", { name: "Settings" }).innerText()).trim()).toBe("Settings");
  await expect(page.locator(".topbar__nav a[aria-current=page]")).toHaveText("Recent");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const footer = await page.locator(".footer p").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(footer).toBeLessThanOrEqual(box.top);
  void errors;
});

test("chosen in Settings, the tabs go back to the top at once, and stay there", async ({ page, errors }) => {
  await open(page, "/settings");
  await page.getByRole("radio", { name: "At the top" }).check();
  expect((await navBox(page)).top).toBeLessThan(100);
  expect((await page.getByRole("link", { name: "Settings" }).innerText()).trim()).toBe(""); // the cog alone, named for screen readers
  await open(page, "/");
  expect((await navBox(page)).top).toBeLessThan(100);
  void errors;
});

// Owner, 2026-11-09: scrolling past a page's end stretched the bottom tabs with it (Android stretches the whole view,
// fixed bars and all). The page doesn't overscroll, so nothing stretches.
test("scrolling past a page's end stretches nothing, the tabs included", async ({ page, errors }) => {
  await open(page, "/settings");
  const behaviour = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY,
    getComputedStyle(document.body).overscrollBehaviorY]);
  expect(behaviour).toEqual(["none", "none"]);
  void errors;
});

test.describe("on a short screen", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test("the tabs stay at the top", async ({ page, errors }) => {
    await open(page, "/");
    expect((await navBox(page)).top).toBeLessThan(100);
    void errors;
  });
});
