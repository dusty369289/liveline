// The Train view tab: the train in its scenery, its coaches, the two ends of the journey. Demo mode at 09:20.
// These run with reduced motion (the scene stands still: nothing to wait for, and that path is tested too), except
// the ones about movement, which say so.
import type { Page, TestInfo } from "@playwright/test";
import { audit, expect, open, openTrain, snap, test } from "./support";

test.use({ reducedMotion: "reduce" });

async function trainView(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Train view" }).click();
  await expect(page.locator("[data-scene-panel]")).toBeVisible();
  await page.waitForTimeout(300);
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  expect(await audit(page)).toEqual([]);
  await snap(page, info, name);
}

test("running: the whole train, the station it left and the next it's due at", async ({ page, errors }, info) => {
  await openTrain(page);
  await trainView(page);
  await expect(page.locator(".scene")).toHaveAttribute("data-phase", /running|crawling/);
  await expect(page.locator(".coaches__item")).toHaveCount(9);
  await expect(page.locator(".scene__end--from .scene__where")).toHaveText(/^Left /);
  await expect(page.locator(".scene__end--to .scene__where")).toHaveText(/^Due at /);
  await expect(page.locator("#panel-route")).toBeHidden();
  await expect(page.locator("[data-formation-note]")).toContainText(/Class 800, unit \d+\./); // one unit: "unit", not "units"
  await expect(page.locator(".coaches__name").first()).toHaveText("Coach A"); // the demo sends coach letters
  // The line between the two ends runs level with both times, however the labels above them wrap
  const line = (await page.locator(".scene__line").boundingBox())!;
  for (const end of ["from", "to"]) {
    const time = (await page.locator(`.scene__end--${end} .scene__time`).boundingBox())!;
    const mid = line.y + line.height / 2;
    expect(mid, end).toBeGreaterThan(time.y);
    expect(mid, end).toBeLessThan(time.y + time.height);
  }
  await shot(page, info, "20-train-view-running");
  void errors;
});

test("the coaches scroll sideways, and the strip says which are on screen", async ({ page, errors }) => {
  await openTrain(page);
  await trainView(page);
  const text = page.locator("[data-map-text]");
  await expect(text).toContainText("of 9");
  const before = await text.innerText();
  await page.locator("[data-scroller]").evaluate((el) => { el.scrollLeft = 0; }); // to the back of the train
  await expect(text).not.toHaveText(before);
  void errors;
});

test("standing at the first station before it leaves, under its sign", async ({ page, errors }, info) => {
  await openTrain(page, "09:30");
  await trainView(page);
  await expect(page.locator(".scene")).toHaveAttribute("data-phase", "stopped");
  await expect(page.locator("[data-platform] text").first()).toHaveText("London Paddington");
  await expect(page.locator(".scene__end--from .scene__where")).toHaveText(/^Leaves London Paddington/);
  await shot(page, info, "21-train-view-waiting");
  void errors;
});

test.describe("moving", () => {
  test.use({ reducedMotion: "no-preference" });

test("pulls away from the platform once it's reported gone", async ({ page, errors }) => {
  await openTrain(page, "09:30"); // at 09:20, standing at Paddington
  await trainView(page);
  await expect(page.locator(".scene")).toHaveAttribute("data-phase", "stopped");
  // To 09:34: the simulator (deterministic) has this one leave a few minutes late, at 09:33
  await page.clock.fastForward("14:00");
  await expect(page.locator(".scene")).toHaveAttribute("data-phase", /running|crawling/);
  const at = async () => (await page.locator("[data-platform]").boundingBox())!.x;
  const first = await at();
  await page.clock.runFor(1000);
  expect(await at()).toBeLessThan(first); // the platform slides back as the train picks up speed
  void errors;
});
});

test("with reduced motion the scenery stands still, though the train is running", async ({ page, errors }) => {
  await openTrain(page);
  await trainView(page);
  await expect(page.locator(".scene")).toHaveAttribute("data-phase", /running|crawling/);
  const far = page.locator('[data-layer="near"]');
  const before = await far.evaluate((el) => (el as HTMLElement).style.transform);
  await page.clock.runFor(1000);
  expect(await far.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before);
  void errors;
});

test("arrived: at the last station, nothing more due", async ({ page, errors }, info) => {
  await openTrain(page, "07:00");
  await trainView(page);
  await expect(page.locator(".scene")).toHaveAttribute("data-phase", "arrived");
  await expect(page.locator(".scene__end--from .scene__where")).toHaveText(/^Arrived at /);
  await shot(page, info, "22-train-view-arrived");
  void errors;
});

test("the train page opens on the tab you used last", async ({ page, errors }) => {
  await openTrain(page);
  await trainView(page);
  await page.reload();
  await page.locator("[data-trainbar]").waitFor();
  await expect(page.getByRole("tab", { name: "Train view" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-scene-panel]")).toBeVisible();
  await page.getByRole("tab", { name: "Route" }).click();
  await expect(page.locator("[data-train-marker]")).toBeVisible(); // placed once the route can be seen
  void errors;
});

test("arrow keys move between the tabs", async ({ page, errors }) => {
  await openTrain(page);
  await page.getByRole("tab", { name: "Route" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Train view" })).toBeFocused();
  await expect(page.locator("[data-scene-panel]")).toBeVisible();
  void errors;
});

test("every sky, for the contact sheet (the clock here is always 09:20, so day)", async ({ page, errors }, info) => {
  await openTrain(page);
  await trainView(page);
  const scene = page.locator(".scene");
  for (const sky of ["dawn", "day", "dusk", "night"]) {
    await scene.evaluate((el, s) => { (el as HTMLElement).dataset.sky = s; }, sky);
    await scene.screenshot({ path: `.ui-report/${info.project.name}/23-sky-${sky}.png` });
  }
  void errors;
});

test("the sky follows the clock: day at 09:20 in November", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await page.locator(".trains__link").first().click();
  await trainView(page);
  await expect(page.locator(".scene")).toHaveAttribute("data-sky", "day");
  void errors;
});
