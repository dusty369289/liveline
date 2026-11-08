// Shared set-up for the browser tests: a fixed moment on the simulated railway, no network, and the layout audit.
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { STORE } from "../../src/core/keys";
import { SimTransport } from "../../src/core/simulator";

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

/** Save a key before the app starts: a made-up one, never a real key, under the core's own storage name. */
export async function seedKey(page: Page): Promise<void> {
  await page.addInitScript((name) => localStorage.setItem(name, "made-up-key-for-the-simulator"), STORE.key);
}

export interface KeyedRtt {
  count: (path: string) => number;
  advance: (ms: number) => Promise<void>;
  /** Answer service calls with this status instead of the simulator's answer (null: the simulator's). */
  serviceStatus: number | null;
  /** What x-ratelimit-remaining-hour says on every answer (null: the simulator's own count). */
  hourLeft: number | null;
}

/**
 * The app with a key (seedKey), answered by the simulator through the /rtt relay, so the page runs the keyed code
 * paths (budget, background calls) and the test can count what it asks. `advance` moves the page's clock and the
 * simulator's together; `serviceStatus` and `hourLeft` are faults a test can set at any point.
 */
export async function keyedRtt(page: Page): Promise<KeyedRtt> {
  let now = MOMENT.getTime();
  const sim = new SimTransport(() => now);
  const seen: string[] = [];
  await seedKey(page);
  await page.route("**/rtt/**", async (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.replace(/^\/rtt/, "");
    seen.push(path);
    const res = sim.getSync(path, Object.fromEntries(url.searchParams));
    const headers = { ...res.headers };
    if (fake.hourLeft != null) headers["x-ratelimit-remaining-hour"] = String(fake.hourLeft);
    if (path === "/gb-nr/service" && fake.serviceStatus != null) {
      return r.fulfill({ status: fake.serviceStatus, headers, contentType: "application/json", body: '{"error":"no"}' });
    }
    await r.fulfill({ status: res.status, headers, contentType: "application/json", body: res.body == null ? "" : JSON.stringify(res.body) });
  });
  const fake: KeyedRtt = {
    serviceStatus: null,
    hourLeft: null,
    count: (path) => seen.filter((p) => p === path).length,
    // A jump, firing each due timer once (as a phone does after a while asleep), not every 1 s tick on the way. Then
    // a moment of real time, so a request a timer started has reached the count before anyone says "nothing asked"
    advance: async (ms) => {
      now += ms;
      await page.clock.fastForward(ms);
      await page.waitForTimeout(300);
    },
  };
  return fake;
}

/** Send the app to the background (or bring it back), as a phone does: visibilityState and its event. */
export async function setVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (v ? "visible" : "hidden") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}

/** The phone's text size at 200%, as Android's largest font setting gives a web view: the root text size doubles. */
export async function largeText(page: Page): Promise<void> {
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.style.fontSize = "200%";
  }));
}

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
 * lines, a tap target under 44 px (links inside sentences are exempt: their line is the target; a link that is the whole line
 * is a control, and isn't).
 */
export async function audit(page: Page): Promise<string[]> {
  // The screen's width, from Playwright. Not innerWidth or clientWidth: under mobile emulation the layout viewport
  // grows to fit content that runs wide, so measuring against it can never see the overflow it is meant to catch
  const vw = page.viewportSize()!.width;
  return page.evaluate((vw) => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
    const scroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden], .visually-hidden")) continue;
      // Hidden for sight but kept for screen readers by a theme (the operator's name behind its badge): clipped on purpose
      if (cs.position === "absolute" && cs.clip === "rect(0px, 0px, 0px, 0px)") continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      // Past the screen's right edge. Scenery (aria-hidden) and anything inside its own sideways scroller may be
      if (b.right + scrollX > vw + 0.5 && !el.closest('[aria-hidden="true"]') && !scroller(el)) {
        out.push(`past the screen's edge by ${Math.round(b.right + scrollX - vw)}px: ${el.tagName.toLowerCase()}.${el.className}`);
      }
      // (Decorative art, aria-hidden, is meant to run off its window: the Train view's scenery and signs)
      if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1
        && el.textContent?.trim() && cs.textOverflow !== "ellipsis" && !el.closest('[aria-hidden="true"]')) {
        out.push(`clipped: .${el.className} "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    // The route line is one unbroken line: each row's piece of rail (its mark's ::before) overlaps the next row's.
    // Merely touching isn't enough: rows end at fractions of a device pixel, where two edges that meet blend into a
    // hairline seam across the line, so each piece must reach at least half a pixel into the next.
    let railEnd: number | null = null;
    for (const li of document.querySelectorAll<HTMLElement>(".route > li")) {
      const mark = li.querySelector<HTMLElement>(".route__mark");
      const b = mark?.getBoundingClientRect();
      if (!mark || !b?.height || getComputedStyle(li).display === "none") continue;
      const rail = getComputedStyle(mark, "::before");
      const top = b.top + parseFloat(rail.top);
      if (railEnd !== null && top > railEnd - 0.5) out.push(`route line gap or seam (${(top - railEnd).toFixed(2)}px) above "${li.textContent?.trim().slice(0, 30)}"`);
      railEnd = b.bottom - parseFloat(rail.bottom);
    }
    for (const el of document.querySelectorAll<HTMLElement>(".route__tag, .trains__plat, .topbar__nav a, .keybox__manage")) {
      if (el.getClientRects().length > 1) out.push(`wrapped: .${el.className} "${el.textContent?.trim()}"`);
    }
    for (const el of document.querySelectorAll<HTMLElement>("a, button, input, summary, select")) {
      const b = el.getBoundingClientRect();
      if (!b.width || el.closest("[hidden], .skip-link, .legend__list, footer")) continue;
      // A link inside a sentence is exempt, but one that is the whole line is a control of its own and needs 44 px
      const line = el.closest("p, dd, .steps li, .bullets li, li.trains__row .trains__meta");
      if (line && line.textContent?.trim() !== el.textContent?.trim()) continue;
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) continue; // the label is the target
      if (b.height < 44) out.push(`small target ${Math.round(b.width)}x${Math.round(b.height)}: ${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 25)}"`);
    }
    return [...new Set(out)];
  }, vw);
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
