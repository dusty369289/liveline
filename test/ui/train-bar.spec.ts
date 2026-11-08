// The train page bar's messages with a key set, against a fake RTT: the bar says it short, the status region (what
// screen readers hear) says it in full. Demo mode can't show these: the simulator never fails or runs out.
import { expect, keyedRtt, openTrain, test } from "./support";

test("a refresh that fails says so briefly in the bar, and why to screen readers", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  await openTrain(page);
  rtt.serviceStatus = 404; // the client throws on this even with an answer cached (a 5xx would show the cached one)
  await page.clock.fastForward(20_000); // past the 15 s a manual refresh waits while the hour has room
  await page.locator("[data-refresh-now]").click();
  await expect(page.locator("[data-age]")).toHaveText("Couldn't update. Trying again soon.");
  await expect(page.locator("[data-refresh-note]")).toHaveText("Couldn't update: Realtime Trains doesn't know that train.");
  void errors;
});

test("refresh with only the search calls left says so briefly in the bar, and in full to screen readers", async ({ page, errors }) => {
  const rtt = await keyedRtt(page);
  rtt.hourLeft = 10; // exactly the reserve kept for searches (Budget.reserve)
  await openTrain(page);
  await page.locator("[data-refresh-now]").click();
  await expect(page.locator("[data-age]")).toHaveText("Only search calls are left this hour");
  await expect(page.locator("[data-refresh-note]")).toHaveText("Only the calls kept for searches are left this hour. Showing the last answer.");
  void errors;
});
