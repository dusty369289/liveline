// Shared set-up for the browser tests: a fixed moment on the simulated railway, no network, and the layout audit.
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";

/** 09:20 on a Saturday in November (UK time = UTC): the simulator's trains are deterministic from here. */
export const MOMENT = new Date("2026-11-07T09:20:00Z");

export interface Fixtures {
  errors: string[];
}

export const test = base.extend<Fixtures>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
    // Nothing leaves the machine. Playwright tries routes newest first, so the catch-all goes in first: RTT answers
    // "no key" unless a test routes it, GitHub has no releases, and anything else is a test failure.
    await page.route(/^https?:\/\/(?!localhost)/, (r) => {
      errors.push(`network: ${r.request().url()}`);
      return r.abort();
    });
    await page.route("**/rtt/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"no"}' }));
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 404, body: "{}" }));
    await page.clock.install({ time: MOMENT });
    await use(errors);
    expect(errors, "no page errors and no network").toEqual([]);
  },
});
export { expect };

/** Open a hash route and wait for its main heading. */
export async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
  await page.locator("main h1").first().waitFor();
}

/** Open the first train on Paddington's board towards Oxford (has passing points, calls and a destination). */
export async function openTrain(page: Page, time = "09:00"): Promise<void> {
  await open(page, `/board?station=PAD&to=OXF&time=${time}`);
  await page.locator(".trains__link").first().click();
  await page.locator("[data-trainbar]").waitFor();
  await page.waitForTimeout(300); // first placement and jump to the train
}

/**
 * What a person would call broken at phone width: sideways scrolling, text cut off, a sign plate split over two
 * lines, a tap target under 44 px (links inside sentences are exempt: their line is the target).
 */
export async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = innerWidth;
    if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden], .visually-hidden")) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1
        && el.textContent?.trim() && cs.textOverflow !== "ellipsis") {
        out.push(`clipped: .${el.className} "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    for (const el of document.querySelectorAll<HTMLElement>(".route__tag, .trains__plat, .topbar__nav a, .keybox__manage")) {
      if (el.getClientRects().length > 1) out.push(`wrapped: .${el.className} "${el.textContent?.trim()}"`);
    }
    for (const el of document.querySelectorAll<HTMLElement>("a, button, input, summary, select")) {
      const b = el.getBoundingClientRect();
      if (!b.width || el.closest("[hidden], .skip-link, p, dd, .steps li, .bullets li, li.trains__row .trains__meta, .legend__list, footer")) continue;
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) continue; // the label is the target
      if (b.height < 44) out.push(`small target ${Math.round(b.width)}x${Math.round(b.height)}: ${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 25)}"`);
    }
    return [...new Set(out)];
  });
}

/** A full-page picture for the contact sheet (.ui-report/), named by page and project. */
export async function snap(page: Page, info: TestInfo, name: string): Promise<void> {
  const dir = `.ui-report/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  // From the top: a full-page picture taken while scrolled draws sticky bars where the screen's top was, over the text
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
