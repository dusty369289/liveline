// The README's pictures of how a key's allowance is spent, drawn as the app draws a route: a thick line, ringed
// stops, the yellow train. Questions are junctions, answers are where the line ends. The rules shown are
// src/core/budget.ts and src/core/poll.ts (MANUAL, refreshInterval): change them, change these. Tokens and type are
// the default theme's, light and dark with the project. `npm run readme-pictures` makes them, then look at them.
import type { Page, TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { test } from "../ui/support";

const OUT = "docs/img";

/** Draw `svg` (w × h) on the app's origin with its own stylesheet, as Operator colour, and save it. */
async function draw(page: Page, info: TestInfo, name: string, svg: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/fonts/OFL-figtree.txt"); // a page on the app's origin with no CSP, so the theme and fonts load
  await page.setContent(`<!doctype html><html data-theme="operator"><head><meta name="viewport" content="width=${w}">
  <link rel="stylesheet" href="/css/app.css">
  <style>
    html, body { margin: 0; height: ${h}px; overflow: hidden; background: var(--page); }
    svg { display: block; }
    .line { fill: none; stroke: var(--ink); stroke-width: 10; stroke-linecap: round; }
    .app { fill: none; stroke: var(--muted); stroke-width: 10; stroke-linecap: round; }
    .low { fill: none; stroke: var(--late); stroke-width: 10; }
    .kept { fill: none; stroke: var(--very-late); stroke-width: 10; stroke-linecap: round; }
    .stop { fill: var(--page); stroke: var(--ink); stroke-width: 5; }
    .stop.app-stop { stroke: var(--muted); }
    .stop.start { fill: var(--ink); }
    .end { fill: var(--page); stroke: var(--ink); stroke-width: 7; }
    .end.out { stroke: var(--problem); }
    .train { fill: var(--train); stroke: var(--train-edge); stroke-width: 5; }
    .t { font: 700 18px var(--sign-font); fill: var(--ink); }
    .s { font: 500 15px var(--font); fill: var(--muted); }
    .h { font: 800 24px var(--sign-font); fill: var(--ink); letter-spacing: -.01em; }
    .yn { font: 700 14px var(--font); fill: var(--muted); }
  </style></head><body>${svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${info.project.name}.png` });
}

/** Lines of text at (x, y), one under another. */
const text = (cls: string, x: number, y: number, lines: string[], anchor = "middle") =>
  lines.map((l, i) => `<text class="${cls}" x="${x}" y="${y + i * 22}" text-anchor="${anchor}">${l}</text>`).join("");

test("one call: what happens each time the app wants an answer", async ({ page, errors }, info) => {
  const W = 1280, H = 600, Y = 250;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
    ${text("h", 60, 52, ["Every call to Realtime Trains"], "start")}
    <!-- the app's own calls: a branch from "who's asking", through the junction that keeps 10 for you -->
    <path class="app" d="M600 ${Y} C600 330 640 400 720 400 L880 400 L960 400 C1010 400 1040 350 1040 ${Y}"/>
    <path class="app" d="M880 400 L880 540"/>
    <!-- the main line: you -->
    <path class="line" d="M80 ${Y} L1200 ${Y}"/>
    <path class="line" d="M300 ${Y} C300 170 340 110 420 110 L520 110"/>
    <path class="line" d="M1040 ${Y} C1040 340 1080 430 1150 430 L1200 430"/>
    <circle class="stop start" cx="80" cy="${Y}" r="13"/>
    ${text("t", 60, 196, ["The app wants", "an answer"], "start")}
    <circle class="stop" cx="300" cy="${Y}" r="13"/>
    ${text("t", 300, 292, ["A recent answer kept?"])}
    ${text("s", 300, 314, ["(a board: 1 min, or 5 an hour ahead)"])}
    <text class="yn" x="282" y="178" text-anchor="end">yes</text>
    <circle class="end" cx="520" cy="110" r="16"/>
    ${text("t", 548, 106, ["Shown from what's kept:"], "start")}
    ${text("s", 548, 128, ["no call"], "start")}
    <circle class="stop" cx="600" cy="${Y}" r="13"/>
    ${text("t", 600, 216, ["Who's asking?"])}
    ${text("s", 800, 236, ["You: a search, a tap"])}
    ${text("s", 586, 330, ["The app: a poll,", "a board's own refresh"], "end")}
    <circle class="stop app-stop" cx="880" cy="400" r="13"/>
    ${text("t", 858, 442, ["More than 10 calls", "left this hour?"], "end")}
    <text class="yn" x="948" y="390">yes</text>
    <text class="yn" x="892" y="500">no</text>
    <circle class="end" cx="880" cy="540" r="16"/>
    ${text("t", 908, 536, ["Waits: the hour's last 10 are kept"], "start")}
    ${text("s", 908, 558, ["for your searches"], "start")}
    <circle class="stop" cx="1040" cy="${Y}" r="13"/>
    ${text("t", 1040, 160, ["A call free this minute,", "this hour and today, and", "no “wait” from Realtime Trains?"])}
    <text class="yn" x="1070" y="240">yes</text>
    <text class="yn" x="1066" y="318">no</text>
    <circle class="train" cx="1125" cy="${Y}" r="14"/>
    <circle class="end" cx="1200" cy="${Y}" r="16"/>
    ${text("t", 1235, 292, ["Asks Realtime Trains:"], "end")}
    ${text("s", 1235, 314, ["one call, counted"], "end")}
    <circle class="end out" cx="1200" cy="430" r="16"/>
    ${text("t", 1235, 472, ["Shows the last answer, marked old,"], "end")}
    ${text("s", 1235, 494, ["and says when it can ask again"], "end")}
  </svg>`;
  await draw(page, info, "allowance-call", svg, W, H);
  void errors;
});

test("the hour: as its calls run down, the app slows itself", async ({ page, errors }, info) => {
  const W = 1280, H = 390, Y = 170;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
    ${text("h", 60, 52, ["The hour’s 100 calls, as they run down"], "start")}
    ${text("s", 60, 80, ["At the top of each hour all 100 come back, and the train starts again from the left."], "start")}
    <path class="line" d="M100 ${Y} L560 ${Y}"/>
    <path class="low" d="M560 ${Y} L860 ${Y}"/>
    <path class="kept" d="M860 ${Y} L1160 ${Y}"/>
    <circle class="stop start" cx="100" cy="${Y}" r="13"/>
    <circle class="stop" cx="560" cy="${Y}" r="13"/>
    <circle class="stop" cx="860" cy="${Y}" r="13"/>
    <circle class="end out" cx="1160" cy="${Y}" r="16"/>
    ${text("t", 100, 138, ["100 left"])}
    ${text("t", 560, 138, ["30 left"])}
    ${text("t", 860, 138, ["10 left"])}
    ${text("t", 1160, 138, ["None"])}
    <circle class="train" cx="330" cy="${Y}" r="14"/>
    ${text("t", 330, 222, ["Refresh: an answer over 15 s old"])}
    ${text("s", 330, 246, ["Polls: when the train next reports,", "at most once a minute"])}
    ${text("t", 710, 222, ["Refresh: only over 60 s old"])}
    ${text("s", 710, 246, ["Polls spread to the hour’s end: no sooner", "than the seconds left ÷ (calls left − 10)"])}
    ${text("t", 1010, 222, ["Searches only"])}
    ${text("s", 1010, 246, ["Refresh shows what’s on screen;", "polls wait for calls to free up"])}
    ${text("t", 1220, 330, ["None left: the last answers, marked old,"], "end")}
    ${text("s", 1220, 352, ["and “Allowance used up” says when searches work again"], "end")}
  </svg>`;
  await draw(page, info, "allowance-hour", svg, W, H);
  void errors;
});
