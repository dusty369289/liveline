// The README's pictures (playwright.readme.config.ts): the real app in demo mode at 09:20 on the simulated railway,
// each in the light and the dark theme. Run `npm run readme-pictures` after a visible change, and look at them.
import type { Page, TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { expect, open, openTrain, test } from "../ui/support";

const OUT = "docs/img";

/** The phone's screen as you'd see it, without the demo banner (the README says the trains are simulated). */
async function screen(page: Page, info: TestInfo, name: string, top = true): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (top) await page.evaluate(() => window.scrollTo(0, 0));
  // The app's CSP refuses injected styles (rightly), so take the banner out of the page instead
  await page.evaluate(() => document.querySelector(".banner--demo")?.remove());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}-${info.project.name}.png`, animations: "disabled" });
}

test("search, with a saved journey and a train to carry on with", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await page.locator("[data-save-journey]").click();
  await openTrain(page);
  await open(page, "/");
  await expect(page.locator(".carry")).toBeVisible();
  await screen(page, info, "search");
  void errors;
});

test("a board", async ({ page, errors }, info) => {
  await open(page, "/board?station=PAD&time=09:00");
  await screen(page, info, "board");
  void errors;
});

test("a train: your stop, and the train on the line", async ({ page, errors }, info) => {
  await openTrain(page);
  await screen(page, info, "train");
  await page.locator("[data-jump]").click();
  await page.waitForTimeout(600);
  await screen(page, info, "train-line", false);
  void errors;
});

/** The banner: the name, what it does, and a Beck-style line with the train between two stops. Tokens from the theme. */
test("banner", async ({ page, errors }, info) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto("/fonts/OFL-barlow.txt"); // a page on the app's origin with no CSP, so the theme and fonts load
  const stops = ["London Paddington", "Slough", "Reading", "Didcot Parkway", "Oxford"];
  const x = (i: number) => 600 + i * 150;
  const ticks = [0.3, 0.55, 0.8, 1.35, 1.65, 2.5, 3.3, 3.6].map((f) => `<line x1="${600 + f * 150}" y1="182" x2="${600 + f * 150}" y2="198"/>`).join("");
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=1280">
  <link rel="stylesheet" href="/css/app.css">
  <style>
    html, body { margin: 0; height: 300px; overflow: hidden; background: var(--page); }
    .b { position: relative; height: 300px; }
    h1 { position: absolute; left: 72px; top: 70px; margin: 0; font: 700 6rem/1 var(--sign-font); color: var(--ink); letter-spacing: -.01em; }
    p { position: absolute; left: 76px; top: 178px; margin: 0; font: 500 1.6rem/1.3 var(--font); color: var(--muted); width: 420px; }
    svg { position: absolute; left: 0; top: 0; }
    .line { stroke: var(--ink); stroke-width: 10; stroke-linecap: round; }
    .ticks line { stroke: var(--ink); stroke-width: 3; }
    .stop { fill: var(--page); stroke: var(--ink); stroke-width: 5; }
    .stop.gone { fill: var(--ink); }
    text { font: 600 17px var(--sign-font); fill: var(--ink); }
    .train { fill: var(--train); stroke: var(--train-edge); stroke-width: 5; }
  </style></head><body><div class="b">
    <h1>LiveLine</h1>
    <p>Where your train really is,<br>between stations.</p>
    <svg width="1280" height="300" aria-hidden="true">
      <line class="line" x1="${x(0)}" y1="190" x2="${x(4)}" y2="190"/>
      <g class="ticks">${ticks}</g>
      ${stops.map((s, i) => `<circle class="stop${i <= 1 ? " gone" : ""}" cx="${x(i)}" cy="190" r="13"/>
        <text x="${x(i)}" y="${i % 2 ? 240 : 150}" text-anchor="middle">${s}</text>`).join("")}
      <circle class="train" cx="${x(1) + 52}" cy="190" r="17"/>
    </svg>
  </div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/banner-${info.project.name}.png` });
  void errors;
});
