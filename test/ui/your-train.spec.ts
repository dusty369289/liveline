// The search page's room above its heading on a tall phone (owner, 2026-11-08): the train you're on as the train page
// last counted it, a refresh that asks RTT at most once a minute, and a cross for when you're only looking.
import { audit, expect, keyedRtt, ONCE, open, openTrain, snap, test } from "./support";

const SERVICE = "/gb-nr/service";

test("the search page shows your train's big number, and the clock when there's none", async ({ page, errors }, info) => {
  await open(page, "/");
  await expect(page.locator(".home__clock [data-clock]")).toHaveText("09:20");
  await expect(page.locator(".home__date")).toHaveText("Saturday 7 November"); // the suite's fixed moment
  await openTrain(page);
  await open(page, "/");
  const glance = page.locator(".home__glance");
  await expect(glance).toContainText("Your train");
  await expect(glance.locator(".live__hero-num")).toHaveText(/^\d+$/);
  await expect(glance).toContainText(/until it (leaves|reaches) \S/);
  await expect(glance.locator("[data-glance-said]")).toContainText("as of 09:20");
  await expect(page.locator(".carry:not(.carry--saved)")).toBeHidden(); // said once, above
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "10b-search-your-train");
  void errors;
});

test("its refresh asks once a minute at most: a sooner tap costs nothing", ONCE, async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  await openTrain(page);
  await page.locator(".topbar__nav a", { hasText: "Search" }).click();
  const refresh = page.getByRole("button", { name: "Refresh your train" });
  await expect(refresh).toBeVisible();
  const before = rtt.count(SERVICE);
  await rtt.advance(20_000); // past the 15 s any tapped refresh waits (poll.ts), still inside the minute
  await refresh.click();
  await expect(page.locator("[data-glance-said]")).toContainText("Up to date: refresh again in");
  await rtt.advance(1000);
  expect(rtt.count(SERVICE)).toBe(before);
  await rtt.advance(41_000);
  await page.getByRole("button", { name: "Refresh your train" }).click();
  await expect.poll(() => rtt.count(SERVICE)).toBe(before + 1);
  await expect(page.locator("[data-glance-said]")).toContainText("as of 09:21");
  void errors;
});

test("its cross stops showing the train here, which stays in Recent", ONCE, async ({ page, errors }) => {
  await openTrain(page);
  await open(page, "/");
  await page.getByRole("button", { name: "Stop showing this train here" }).click();
  await expect(page.locator(".home__glance")).toHaveCount(0);
  await expect(page.locator("[data-clock]")).toBeVisible();
  await expect(page.locator(".carry:not(.carry--saved)")).toHaveCount(0); // and Carry on with it
  await open(page, "/recent"); // away and back, so the search page is drawn again from what's stored
  await open(page, "/");
  await expect(page.locator(".home__glance")).toHaveCount(0); // and it stays gone
  await expect(page.locator(".carry:not(.carry--saved)")).toHaveCount(0);
  await open(page, "/recent");
  await expect(page.locator(".recents__item")).toHaveCount(1);
  void errors;
});
