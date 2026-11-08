// The Train view tab: the train in its scenery, its coaches, the two ends of the journey. Demo mode at 09:20.
// These run with reduced motion (the scene stands still: nothing to wait for, and that path is tested too), except
// the ones about movement, which say so.
import type { Page, TestInfo } from "@playwright/test";
import { fakeService, type FakeLocation } from "../support";
import { audit, expect, largeText, open, openTrain, seedKey, snap, test } from "./support";

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

test("from standing at one station to standing at the next in one answer, it shows the trip between", async ({ page, errors }, info) => {
  // 2026-11-08: a poll went from "at Bescot" to "at Tame Bridge Parkway" and the sign just changed. Made-up answers
  // behind a made-up key: standing at Bescot (09:15), then, refreshed, standing at Tame Bridge (in 09:19).
  const stops = (atTame: boolean): FakeLocation[] => [
    { name: "Walsall", crs: "WSL", dep: { gbtt: "09:10", wtt: "09:10", actual: "09:10" } },
    { name: "Bescot Stadium", crs: "BSC", arr: { gbtt: "09:15", wtt: "09:15", actual: "09:15" },
      dep: { gbtt: "09:16", wtt: "09:16", actual: atTame ? "09:16" : undefined } },
    { name: "Tame Bridge Parkway", crs: "TAB", arr: { gbtt: "09:19", wtt: "09:19", actual: atTame ? "09:19" : undefined },
      dep: { gbtt: "09:24", wtt: "09:24" } },
    { name: "Birmingham New Street", crs: "BHM", arr: { gbtt: "09:35", wtt: "09:35" } },
  ];
  let atTame = false;
  await seedKey(page);
  await page.route("**/rtt/api/info**", (r) => r.fulfill({ json: { api_version: "2026-07-25", credentials: { entitlements: [] } } }));
  await page.route("**/rtt/gb-nr/service**", (r) => r.fulfill({ json: fakeService(stops(atTame)) }));
  await page.goto("/#/train/X12345:2026-11-07?at=BSC&to=BHM");
  await page.locator("[data-trainbar]").waitFor();
  await trainView(page);
  const sign = page.locator("[data-platform] text").first();
  await expect(sign).toHaveText("Bescot Stadium");
  const at = async () => (await page.locator("[data-platform]").boundingBox())!.x;
  const standing = await at();

  atTame = true;
  await page.clock.fastForward(20_000); // old enough for a tap to fetch
  await page.locator("[data-refresh-now]").click();
  await expect(page.locator("[data-scene-panel] [data-ends]").first()).toContainText("Tame Bridge Parkway");
  // It pulls away from Bescot: the old sign still up, its platform sliding back
  expect(await sign.textContent()).toBe("Bescot Stadium");
  await page.clock.runFor(1500);
  expect(await at()).toBeLessThan(standing);
  expect(await sign.textContent()).toBe("Bescot Stadium");
  await snap(page, info, "27-train-view-hop-leaving");
  // Then Tame Bridge's platform comes in, and the train brakes onto it and stands
  await expect.poll(async () => { await page.clock.runFor(250); return sign.textContent(); }).toBe("Tame Bridge Parkway");
  await page.clock.runFor(1000);
  await snap(page, info, "28-train-view-hop-arriving");
  await page.clock.runFor(15_000);
  await expect(sign).toHaveText("Tame Bridge Parkway");
  const landed = await at();
  await page.clock.runFor(1000);
  expect(await at()).toBe(landed);
  expect(Math.abs(landed - standing)).toBeLessThan(1); // where a standing train's platform always is
  void errors;
});
});

test("at large system text (200%), the coaches' names and icons and the bar's age all show", async ({ page, errors }, info) => {
  await largeText(page);
  await openTrain(page);
  await trainView(page);
  expect(await audit(page)).toEqual([]);
  const cut = await page.evaluate(() => {
    const out: string[] = [];
    const scene = document.querySelector(".scene")!.getBoundingClientRect();
    for (const el of document.querySelectorAll(".coaches__item")) {
      const b = el.getBoundingClientRect();
      if (b.bottom > scene.bottom + 0.5) out.push(`coach cut off by ${Math.round(b.bottom - scene.bottom)}px`);
    }
    const age = document.querySelector<HTMLElement>(".trainbar__age")!;
    if (getComputedStyle(age).textOverflow === "ellipsis" || age.scrollWidth > age.clientWidth + 1) out.push("age cut short");
    const jump = document.querySelector<HTMLElement>(".trainbar__jump")!;
    if (getComputedStyle(jump).display !== "none") out.push("Jump to train still takes room");
    return [...new Set(out)];
  });
  expect(cut).toEqual([]);
  // One screen, not the whole (very long) page: the coaches at the foot, the sticky bar at the top
  await page.locator(".scene__coaches").evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.screenshot({ path: `.ui-report/${info.project.name}/24-train-view-large-text.png` });
  void errors;
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
