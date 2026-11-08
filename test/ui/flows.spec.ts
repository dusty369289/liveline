// What people do, end to end, in the built app (demo mode: the simulator, at a fixed moment).
import type { Page } from "@playwright/test";
import { expect, open, openTrain, test } from "./support";

test("search by typing and picking suggestions lands on the board", async ({ page, errors }) => {
  await open(page, "/");
  await page.locator("#station").fill("padd");
  await page.locator("#station-list [role=option]").first().click();
  await page.locator("#to").fill("oxf");
  await page.locator("#to-list [role=option]").first().click();
  await expect(page.locator("#time")).toBeHidden(); // "now" by default: time and day are folded away
  await page.locator(".search__when summary").click();
  await page.locator("#time").fill("09:00");
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".board__sub")).toContainText("calling at Oxford");
  void errors;
});

test("the second station's label follows Departures and Arrivals", async ({ page, errors }) => {
  await open(page, "/");
  await expect(page.locator('[data-label-for="to"]')).toContainText("Calling at");
  await page.locator('input[name="mode"][value="arr"]').check();
  await expect(page.locator('[data-label-for="to"]')).toContainText("Coming from");
  await page.locator('input[name="mode"][value="dep"]').check();
  await expect(page.locator('[data-label-for="to"]')).toContainText("Calling at");
  void errors;
});

test("Later and Earlier step the board by an hour", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&time=09:00");
  await page.getByRole("link", { name: "Later", exact: true }).click();
  await expect(page.locator(".board__sub")).toContainText("10:00 to 11:00");
  await page.getByRole("link", { name: "Earlier", exact: true }).click();
  await expect(page.locator(".board__sub")).toContainText("09:00 to 10:00");
  void errors;
});

test("the passing points the train is among open by themselves, and fold away if asked", async ({ page, errors }) => {
  await openTrain(page); // at 09:20 the 09:00 is between Paddington and Slough, inside the first group
  const fold = page.locator("[data-fold-toggle]").first();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toContainText("Fold away");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false"); // you folded it: it stays folded
  await page.locator("[data-refresh-now]").click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  void errors;
});

test("passing points open and fold away", async ({ page, errors }) => {
  await openTrain(page);
  const fold = page.locator("[data-fold-toggle]").last(); // a group the train isn't in yet
  const label = await fold.innerText();
  expect(label).toMatch(/^\d+ passing points?$/);
  const n = Number(label.split(" ")[0]);
  const group = fold.getAttribute("data-fold-toggle");
  const rows = page.locator(`.route__pt[data-group="${await group}"]`);
  await expect(rows.first()).toBeHidden();
  await fold.click();
  await expect(fold).toHaveText(`Fold away ${n} passing point${n === 1 ? "" : "s"}`);
  await expect(rows).toHaveCount(n);
  await expect(rows.first()).toBeVisible();
  await fold.click();
  await expect(rows.first()).toBeHidden();
  void errors;
});

/** Scroll to the end of the page, on a screen short enough that it really scrolls (the demo pages can fit on one). */
async function scrollFar(page: Page): Promise<void> {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 420 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100); // the navy top bar has gone off screen
}

test("the train page bar stays on screen while scrolling the route", async ({ page, errors }) => {
  await openTrain(page);
  await scrollFar(page);
  const bar = await page.locator("[data-trainbar]").boundingBox();
  expect(bar?.y).toBe(0);
  await page.locator("[data-refresh-now]").click(); // the answer is fresh: says so, costs nothing
  await expect(page.locator("[data-age]")).toContainText("Already up to date");
  void errors;
});

// A browser has no status bar, so env(safe-area-inset-top) is 0 here. The CSS reads it once, into --inset-top
// (test/design.test.ts holds it to that), so setting --inset-top stands in for an edge-to-edge phone's status bar.
const INSET = 24;
async function fakeStatusBar(page: Page, px = INSET): Promise<void> {
  await page.evaluate((v) => document.documentElement.style.setProperty("--inset-top", `${v}px`), px);
}
async function statusStrip(page: Page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.body, "::before");
    const probe = document.createElement("i");
    probe.style.color = "var(--sign)";
    document.body.append(probe);
    const sign = getComputedStyle(probe).color;
    probe.remove();
    return { position: s.position, top: s.top, height: s.height, z: Number(s.zIndex), colour: s.backgroundColor, sign };
  });
}

test("a navy strip sits behind the status bar on every page, however far it's scrolled", async ({ page, errors }) => {
  // the status icons are light on a phone (platform/index.ts): they need navy under them, not paper
  await open(page, "/board?station=PAD&time=09:00");
  await page.locator(".trains__row").first().waitFor();
  await fakeStatusBar(page);
  await scrollFar(page);
  const strip = await statusStrip(page);
  expect(strip).toMatchObject({ position: "fixed", top: "0px", height: `${INSET}px` });
  expect(strip.colour).toBe(strip.sign);
  expect(strip.z).toBeGreaterThan(5); // above the sticky train bar and the suggestion lists
  await page.evaluate(() => window.scrollTo(0, 0));
  const logo = await page.locator(".topbar__logo").boundingBox();
  expect(logo!.y).toBeGreaterThanOrEqual(INSET); // the top bar's contents start below the status bar
  void errors;
});

test("the train page bar sticks below the status bar, and adds no band before it sticks", async ({ page, errors }) => {
  await openTrain(page);
  const plain = (await page.locator("[data-trainbar]").boundingBox())!.height;
  await fakeStatusBar(page);
  // in the page's flow (not stuck) it is the same bar as on a phone with no inset: no navy band above it
  expect((await page.locator("[data-trainbar]").boundingBox())!.height).toBe(plain);
  await scrollFar(page);
  const stuck = (await page.locator("[data-trainbar]").boundingBox())!;
  expect(stuck.y).toBe(INSET);
  expect(stuck.height).toBe(plain);
  void errors;
});

test("a train you opened is in Recent, and Recent can be cleared", async ({ page, errors }) => {
  await openTrain(page);
  await open(page, "/");
  await expect(page.locator(".carry__title")).toContainText("London Paddington to Oxford");
  await page.locator(".topbar__nav a", { hasText: "Recent" }).click();
  await expect(page.locator(".recents__title")).toContainText("London Paddington to Oxford");
  await page.locator("[data-clear-recent]").click();
  await expect(page.locator(".recents__item")).toHaveCount(0);
  void errors;
});

test("the marker style is kept after reopening the app", async ({ page, errors }) => {
  await open(page, "/settings");
  await page.locator("input[name=marker][value=bar]").check();
  await page.reload();
  await page.locator("main h1").waitFor();
  await expect(page.locator("input[name=marker][value=bar]")).toBeChecked();
  await openTrain(page);
  await expect(page.locator("[data-train-marker]")).toHaveAttribute("data-m", "bar");
  void errors;
});

test("a key RTT refuses is not saved, and the demo stays", async ({ page, errors }) => {
  await open(page, "/settings");
  await page.locator("#token").fill("x".repeat(40));
  await page.locator("[data-key-form] button[type=submit]").click();
  await expect(page.locator(".settings .problem")).toContainText("refused the key");
  await expect(page.locator(".banner--demo")).toBeVisible();
  void errors;
});
