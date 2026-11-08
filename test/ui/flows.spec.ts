// What people do, end to end, in the built app (demo mode: the simulator, at a fixed moment).
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

test("the train page bar stays on screen while scrolling the route", async ({ page, errors }) => {
  await openTrain(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = await page.locator("[data-trainbar]").boundingBox();
  expect(bar?.y).toBe(0);
  await page.locator("[data-refresh-now]").click(); // the answer is fresh: says so, costs nothing
  await expect(page.locator("[data-age]")).toContainText("Already up to date");
  void errors;
});

test("the stuck train page bar paints the strip under the status bar navy", async ({ page, errors }) => {
  await openTrain(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // On a phone the strip is env(safe-area-inset-top) tall (0 here): its colour is what keeps the light status icons
  // readable once the navy top bar has scrolled away.
  const { border, style, sign } = await page.evaluate(() => {
    const bar = getComputedStyle(document.querySelector("[data-trainbar]")!);
    const probe = document.createElement("i");
    probe.style.color = "var(--sign)";
    document.body.append(probe);
    const sign = getComputedStyle(probe).color;
    probe.remove();
    return { border: bar.borderTopColor, style: bar.borderTopStyle, sign };
  });
  expect(style).toBe("solid");
  expect(border).toBe(sign);
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
