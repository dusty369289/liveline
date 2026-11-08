// What people do, end to end, in the built app (demo mode: the simulator, at a fixed moment).
import type { Page } from "@playwright/test";
import { audit, expect, ONCE, open, openTrain, snap, test } from "./support";

test("search by typing and picking suggestions lands on the board", ONCE, async ({ page, errors }) => {
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

test("the station box is a named combobox, and says how many stations match as you type", ONCE, async ({ page, errors }) => {
  await open(page, "/");
  const box = page.getByRole("combobox", { name: "Station" });
  await expect(box).toHaveAttribute("aria-expanded", "false");
  const status = page.locator('[data-suggest-status="station"]');
  await box.fill("padd");
  await expect(page.getByRole("listbox", { name: "Station" })).toBeVisible();
  await expect(status).toHaveText(/^\d+ stations? match(es)?$/);
  await box.fill("zzzz");
  await expect(status).toHaveText("No stations match");
  await box.press("Escape");
  await box.fill("padd");
  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", "station-list-0");
  await box.press("Escape");
  await expect(box).not.toHaveAttribute("aria-activedescendant", /./);
  void errors;
});

test("the second station's label follows Departures and Arrivals", ONCE, async ({ page, errors }) => {
  await open(page, "/");
  await expect(page.locator('[data-label-for="to"]')).toContainText("Calling at");
  await page.locator('input[name="mode"][value="arr"]').check();
  await expect(page.locator('[data-label-for="to"]')).toContainText("Coming from");
  await page.locator('input[name="mode"][value="dep"]').check();
  await expect(page.locator('[data-label-for="to"]')).toContainText("Calling at");
  void errors;
});

test("tabbing onto the checked radio keeps the dark focus ring, not just the yellow outline", async ({ page, errors }) => {
  await open(page, "/");
  await page.locator("#station").focus();
  await page.keyboard.press("Tab"); // a radio group takes focus on its checked radio
  const radio = page.locator('input[name="mode"][value="dep"]');
  await expect(radio).toBeFocused();
  await expect(radio).toBeChecked();
  const shadow = await radio.evaluate((el) => getComputedStyle(el).boxShadow);
  // the ring is the one shadow that isn't inset; the checked dot's two are
  expect(shadow.split(/,(?![^(]*\))/).some((s) => /\b5px\b/.test(s) && !s.includes("inset"))).toBe(true);
  void errors;
});

test("Later and Earlier step the board by an hour", ONCE, async ({ page, errors }) => {
  await open(page, "/board?station=PAD&time=09:00");
  await page.getByRole("link", { name: "Later", exact: true }).click();
  await expect(page.locator(".board__sub")).toContainText("10:00 to 11:00");
  await page.getByRole("link", { name: "Earlier", exact: true }).click();
  await expect(page.locator(".board__sub")).toContainText("09:00 to 10:00");
  void errors;
});

test("the passing points the train is among open by themselves, and fold away if asked", ONCE, async ({ page, errors }) => {
  await openTrain(page); // at 09:20 the 09:00 is between Paddington and Slough, inside the first group
  const id = await page.locator("[data-fold-toggle]").first().getAttribute("data-fold-toggle");
  const fold = page.locator(`[data-fold-toggle="${id}"]`);
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toContainText("Fold away");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false"); // you folded it: it stays folded
  const opened = page.locator("[data-fold-toggle]").last(); // a group the train isn't in yet: you opened it
  await opened.click();
  await expect(opened).toHaveAttribute("aria-expanded", "true");
  // old enough that refresh really asks again and redraws the route (a fresh answer would leave it untouched)
  await page.clock.fastForward(20_000);
  await redrawn(page, () => page.locator("[data-refresh-now]").click());
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(opened).toHaveAttribute("aria-expanded", "true");
  void errors;
});

/** Run a step that refetches the train, and wait until the route is redrawn: the marked one is replaced. */
async function redrawn(page: Page, step: () => Promise<void>): Promise<void> {
  await page.locator(".route").evaluate((e) => e.setAttribute("data-drawn-before", ""));
  await step();
  await expect(page.locator(".route[data-drawn-before]")).toHaveCount(0);
  await expect(page.locator(".route")).toHaveCount(1);
}

test("passing points open and fold away", ONCE, async ({ page, errors }) => {
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

test("the train page bar stays on screen while scrolling the route", ONCE, async ({ page, errors }) => {
  await openTrain(page);
  await scrollFar(page);
  const bar = await page.locator("[data-trainbar]").boundingBox();
  expect(bar?.y).toBe(0);
  await page.locator("[data-refresh-now]").click(); // the answer is fresh: says so, costs nothing
  await expect(page.locator("[data-age]")).toContainText("Already up to date");
  void errors;
});

test("the big number counts down between polls", ONCE, async ({ page, errors }) => {
  // About an hour off: the next poll is 3 minutes away, so a change within 90 s is the page's own tick
  await openTrain(page, "10:15");
  const num = page.locator(".live__hero-num");
  const before = Number(await num.textContent());
  await page.clock.runFor(90_000);
  await expect(num).toHaveText(String(before - 1));
  await expect(page.locator("[data-age]")).toContainText("1 min ago"); // no fetch in between
  void errors;
});

test("tabbing back to a passing-point fold brings it out from under the bar", ONCE, async ({ page, errors }) => {
  await openTrain(page);
  const folds = page.locator("[data-fold-toggle]");
  expect(await folds.count()).toBeGreaterThan(1);
  // focus is on the second fold; the first sits just under the screen's top edge, behind the sticky bar
  await folds.nth(1).evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await folds.first().evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 10));
  await page.keyboard.press("Shift+Tab");
  await expect(folds.first()).toBeFocused();
  const bar = (await page.locator("[data-trainbar]").boundingBox())!;
  const fold = (await folds.first().boundingBox())!;
  expect(fold.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  void errors;
});

test("a message in the train page bar wraps rather than being cut off", async ({ page, errors }) => {
  await openTrain(page);
  await page.locator("[data-refresh-now]").click();
  const age = page.locator("[data-age]");
  await expect(age).toContainText("Already up to date");
  await expect(age).toHaveClass(/is-message/);
  // the longest the bar says (live-train.ts, refreshNow), measured in place while the message class is on
  const fits = await age.evaluate((el) => {
    el.textContent = "Only search calls are left this hour";
    return el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1;
  });
  expect(fits).toBe(true);
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
    const bar = getComputedStyle(document.querySelector(".topbar")!).backgroundColor;
    return { position: s.position, top: s.top, height: s.height, z: Number(s.zIndex), colour: s.backgroundColor, bar };
  });
}

test("a strip in the top bar's colour sits behind the status bar on every page, however far it's scrolled", ONCE, async ({ page, errors }) => {
  // the status icons follow the phone's theme (platform/index.ts), as the top bar does: the page never shows through
  await open(page, "/board?station=PAD&time=09:00");
  await page.locator(".trains__row").first().waitFor();
  await fakeStatusBar(page);
  await scrollFar(page);
  const strip = await statusStrip(page);
  expect(strip).toMatchObject({ position: "fixed", top: "0px", height: `${INSET}px` });
  expect(strip.colour).toBe(strip.bar);
  expect(strip.z).toBeGreaterThan(5); // above the sticky train bar and the suggestion lists
  await page.evaluate(() => window.scrollTo(0, 0));
  const logo = await page.locator(".topbar__logo").boundingBox();
  expect(logo!.y).toBeGreaterThanOrEqual(INSET); // the top bar's contents start below the status bar
  void errors;
});

test("the train page bar sticks below the status bar, and adds no band before it sticks", ONCE, async ({ page, errors }) => {
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

test("a train you opened is in Recent, and Recent can be cleared", ONCE, async ({ page, errors }) => {
  await openTrain(page);
  await open(page, "/");
  await expect(page.locator(".carry__title")).toContainText("London Paddington to Oxford");
  await page.locator(".topbar__nav a", { hasText: "Recent" }).click();
  await expect(page.locator(".recents__title")).toContainText("London Paddington to Oxford");
  await page.locator("[data-clear-recent]").click();
  await expect(page.locator(".recents__item")).toHaveCount(0);
  void errors;
});

test("the marker style is kept after reopening the app", ONCE, async ({ page, errors }) => {
  await open(page, "/settings");
  await page.locator("input[name=marker][value=bar]").check();
  await page.reload();
  await page.locator("main h1").waitFor();
  await expect(page.locator("input[name=marker][value=bar]")).toBeChecked();
  await openTrain(page);
  await expect(page.locator("[data-train-marker]")).toHaveAttribute("data-m", "bar");
  void errors;
});

test("a key RTT refuses is not saved, and the demo stays", async ({ page, errors }, info) => {
  await open(page, "/settings");
  const key = page.locator("#token");
  await key.fill("x".repeat(40));
  await page.locator("[data-key-form] button[type=submit]").click();
  const problem = page.locator("#token-error");
  await expect(problem).toContainText("didn't accept that key");
  await expect(problem).not.toContainText("HTTP");
  await expect(key).toHaveValue("x".repeat(40)); // kept, so a typo can be fixed in place
  await expect(key).toHaveAttribute("aria-describedby", "token-error");
  await expect(key).toBeFocused();
  await expect(page.locator("[data-key-form] button[type=submit]")).toBeEnabled();
  await expect(page.locator("[data-flash]")).toBeEmpty(); // said once, under the field, not again in the flash
  await expect(page.locator(".banner--demo")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "09-settings-key-refused");
  void errors;
});

test("a new page starts at the top, its heading in view", ONCE, async ({ page, errors }) => {
  await open(page, "/settings");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('a[href="#/about"]').last().click();
  await expect(page.locator("main h1")).toHaveText(/About/);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator("main h1")).toBeInViewport();
  void errors;
});
