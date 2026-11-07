// Where keyboard and screen-reader focus goes when pages change, and what the app says while it waits.
import { expect, open, test } from "./support";

test("the skip link moves focus to the page, without changing the route", async ({ page, errors }) => {
  await open(page, "/recent");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#/recent");
  await expect(page.locator("main h1")).toHaveText("Recent trains");
  void errors;
});
