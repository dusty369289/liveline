// A bar that sits on the tabs at the foot of the screen (the train page's, a board's) meets them exactly: no sliver of
// the page between the two (owner, 2026-11-09: a pixel or two showed on the Train view). Measured, at normal and
// large text. A phone's screen draws CSS pixels at 2.625 device pixels or so, rounding each fixed bar's edge on its
// own, so meeting exactly isn't enough: the bar runs a pixel under the tabs (which draw over it), and no rounding can
// open a gap.
import type { Page } from "@playwright/test";
import { KEYS } from "../../src/ui/store/keys";
import { expect, open, openTrain, test } from "./support";

/** The gap between a bar's foot and the tabs' top, in CSS px: 0 when they meet, below 0 where the bar runs under. */
const gap = (page: Page, bar: string) => page.evaluate((sel) => {
  const b = document.querySelector(sel)!.getBoundingClientRect();
  const t = document.querySelector(".topbar__nav")!.getBoundingClientRect();
  return Math.round((t.top - b.bottom) * 100) / 100;
}, bar);

const larger = (page: Page) => page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });

for (const text of ["normal", "200%"]) {
  test(`at ${text} text, the train page's bar meets the tabs, on the Route and in the Train view`, async ({ page, errors }) => {
    await openTrain(page);
    if (text !== "normal") await larger(page);
    expect(await gap(page, "[data-trainbar]")).toBeLessThanOrEqual(-1);
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByRole("tab", { name: "Train view" }).click();
    expect(await gap(page, "[data-trainbar]")).toBeLessThanOrEqual(-1);
    void errors;
  });

  test(`at ${text} text, a board's bar meets the tabs`, async ({ page, errors }) => {
    await open(page, "/board?station=PAD&to=OXF&time=09:00");
    if (text !== "normal") await larger(page);
    expect(await gap(page, ".board__nav")).toBeLessThanOrEqual(-1);
    void errors;
  });
}

// The same where tabs at the top stick, with the train page's bar stuck under them (tabs.css, --topbar-h)
test("with the tabs at the top, the train page's bar runs under them as the page scrolls", async ({ page, errors }) => {
  await page.addInitScript((name) => localStorage.setItem(name, JSON.stringify("top")), KEYS.tabs);
  await openTrain(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const overlap = await page.evaluate(() => {
    const t = document.querySelector(".topbar")!.getBoundingClientRect();
    const b = document.querySelector("[data-trainbar]")!.getBoundingClientRect();
    return Math.round((b.top - t.bottom) * 100) / 100;
  });
  expect(overlap).toBeLessThanOrEqual(-1);
  void errors;
});
