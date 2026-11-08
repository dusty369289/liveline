// The search page fits one phone screen with no scrolling: 360 × 700 is a 360 × 800 phone less its status and
// navigation bars, the smallest common app screen. First visit, and coming back with saved things.
import { expect, open, openTrain, test } from "./support";

const fits = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

test.describe("on a small phone's app screen", () => {
  test.use({ viewport: { width: 360, height: 700 } });

  test("the search page fits without scrolling, first visit", async ({ page, errors }) => {
    await open(page, "/");
    expect(await fits(page)).toBeLessThanOrEqual(0);
    void errors;
  });

  test("and coming back: a train to carry on with, a saved journey, recent stations", async ({ page, errors }) => {
    await open(page, "/board?station=PAD&to=OXF&time=09:00");
    await page.locator("[data-save-journey]").click();
    await openTrain(page);
    await open(page, "/");
    await expect(page.locator(".carry:not(.carry--saved)")).toBeVisible();
    await expect(page.locator(".carry--saved")).toBeVisible();
    expect(await fits(page)).toBeLessThanOrEqual(0);
    void errors;
  });
});

test("recent stations are offered as soon as you tap the empty station box", async ({ page, errors }) => {
  await open(page, "/board?station=RDG");
  await open(page, "/");
  await page.locator("#station").focus();
  await expect(page.locator("#station-list [role=option]").first()).toContainText("Reading");
  await page.locator("#station-list [role=option]").first().click();
  await expect(page.locator("#station")).toHaveValue("Reading (RDG)");
  void errors;
});

test("Settings is a cog in the top bar, still named Settings", async ({ page, errors }) => {
  await open(page, "/");
  const cog = page.getByRole("link", { name: "Settings" });
  await expect(cog.locator("svg")).toBeVisible();
  expect((await cog.innerText()).trim()).toBe("");
  await cog.click();
  await expect(page.locator("main h1")).toHaveText("Settings");
  await expect(cog).toHaveAttribute("aria-current", "page");
  void errors;
});
