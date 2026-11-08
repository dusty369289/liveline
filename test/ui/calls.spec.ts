// What the train page asks RTT for, counted, with a (made-up) key: nothing while the app is in the background, a call
// on coming back only if one is due, nothing once a train has arrived, and a tapped refresh restarts the schedule.
import type { Page } from "@playwright/test";
import { expect, keyedRtt, openTrain, setVisible, test } from "./support";

const SERVICE = "/gb-nr/service";
const MIN = 60_000;

/** Seconds until the page's next automatic poll, from the answer on screen (poll.ts via data-refresh). */
const plannedSecs = async (page: Page) => Number(await page.locator(".live").getAttribute("data-refresh"));

test("hidden for 10 minutes asks nothing; coming back asks once, and only when a poll is due", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  await openTrain(page);
  const opened = rtt.count(SERVICE);
  expect(opened).toBeGreaterThan(0);
  await setVisible(page, false);
  await rtt.advance(10 * MIN);
  expect(rtt.count(SERVICE)).toBe(opened);
  await setVisible(page, true); // ten minutes on, a poll is long overdue
  await expect.poll(() => rtt.count(SERVICE)).toBe(opened + 1);
  await expect(page.locator("[data-age]")).toContainText("Updated");
  await setVisible(page, false);
  await setVisible(page, true); // straight back: the answer is fresh, nothing is due
  await rtt.advance(1000);
  expect(rtt.count(SERVICE)).toBe(opened + 1);
  void errors;
});

test("a train that has arrived asks nothing more after its first answer", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  await openTrain(page, "07:00");
  await expect(page.locator(".live")).toHaveAttribute("data-state", "arrived");
  const opened = rtt.count(SERVICE);
  await rtt.advance(10 * MIN);
  expect(rtt.count(SERVICE)).toBe(opened);
  void errors;
});

test("a tapped refresh restarts the schedule: the next automatic call is that many seconds after the tap", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  await openTrain(page);
  const first = await plannedSecs(page);
  await rtt.advance(20_000); // old enough for a tap to fetch
  const before = rtt.count(SERVICE);
  await page.locator("[data-refresh-now]").click();
  await expect.poll(() => rtt.count(SERVICE)).toBe(before + 1);
  const next = await plannedSecs(page);
  // the poll the first answer planned would have gone by now: it was replaced, so nothing is asked
  const old = Math.max(first * 1000 - 20_000, 0) + 2000;
  await rtt.advance(old);
  if (old < next * 1000 - 2000) expect(rtt.count(SERVICE)).toBe(before + 1);
  await rtt.advance(next * 1000 - old - 2000);
  expect(rtt.count(SERVICE)).toBe(before + 1); // 2 s before it's due: not yet
  await rtt.advance(4000);
  await expect.poll(() => rtt.count(SERVICE)).toBe(before + 2);
  void errors;
});
