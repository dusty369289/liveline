// Where keyboard and screen-reader focus goes when pages change, and what the app says while it waits.
import { expect, open, openTrain, test } from "./support";

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

test("opening a train from a board puts focus on the train page's heading", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await page.locator(".trains__link").first().focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-trainbar]").waitFor();
  await expect(page.locator("main h1")).toBeFocused();
  void errors;
});

test("a fold button you're on keeps focus when the train is polled", async ({ page, errors }) => {
  await openTrain(page);
  const fold = page.locator("[data-fold-toggle]").last();
  await fold.focus();
  const which = await fold.getAttribute("data-fold-toggle");
  await page.evaluate(() => ((document.querySelector(".live") as HTMLElement).dataset.old = "1")); // to see the redraw
  await page.clock.fastForward("05:00"); // past the next poll
  await expect(page.locator(".live[data-old]")).toHaveCount(0);
  await expect(page.locator(`[data-fold-toggle="${which}"]`)).toBeFocused();
  void errors;
});

test("while Realtime Trains is slow, the app says it's busy, and stops once the page is drawn", async ({ page, errors }) => {
  // A made-up key (never a real one), so the board asks the faked RTT, which holds its answer until told
  await page.addInitScript(() => localStorage.setItem("rtt.key", "made-up-key-for-tests-only-0123456789"));
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/rtt/**", async (r) => {
    await held;
    await r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"no"}' });
  });
  await page.goto("/#/board?station=PAD&time=09:00");
  await expect(page.locator("#app")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#app")).toHaveClass(/is-navigating/);
  release();
  await page.locator("main h1").waitFor();
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy");
  await expect(page.locator("#app")).not.toHaveClass(/is-navigating/);
  void errors;
});
