// Things read across a row line up on one baseline: a stop's name, its booked time and its live time; a board row's
// time and destination; the Train view's two ends. A lateness note ("+7") once sat under the live time and pushed it
// up out of line with the booked time beside it (owner, 2026-11-08). Checked in every theme, as type differs.
import type { Locator, Page } from "@playwright/test";
import { THEMES } from "../../src/ui/store/appearance";
import { KEYS } from "../../src/ui/store/keys";
import { expect, open, openTrain, test } from "./support";

/** Within 1 px: subpixel rounding, not a visible step. */
const TOLERANCE = 1;

/**
 * For each row, the baseline of the first line of text in each of `parts` (selectors inside the row): a zero-size
 * inline block put before the first text sits with its foot on that line's baseline, whatever the type's size.
 */
async function baselines(rows: Locator, parts: string[]): Promise<Array<Record<string, number | null>>> {
  return rows.evaluateAll((els, sels) => els.map((row) => {
    const out: Record<string, number | null> = { row: Math.round(row.getBoundingClientRect().top) };
    for (const sel of sels) {
      const el = row.querySelector(sel);
      const walker = el && document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() ? 1 : 3) });
      const text = walker?.nextNode();
      if (!text) { out[sel] = null; continue; }
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      text.parentNode!.insertBefore(probe, text);
      out[sel] = probe.getBoundingClientRect().bottom;
      probe.remove();
    }
    return out;
  }), parts);
}

/** Rows where any two of the parts present sit on baselines more than TOLERANCE apart. */
function offLine(rows: Array<Record<string, number | null>>): Array<Record<string, number | null>> {
  return rows.filter((r) => {
    const ys = Object.entries(r).filter(([k, v]) => k !== "row" && v != null).map(([, v]) => v as number);
    return ys.length > 1 && Math.max(...ys) - Math.min(...ys) > TOLERANCE;
  });
}

async function useTheme(page: Page, id: string): Promise<void> {
  await page.addInitScript(([name, value]) => localStorage.setItem(name, JSON.stringify(value)), [KEYS.theme, id]);
}

for (const [id, name] of THEMES) {
  test.describe(name, () => {
    test.beforeEach(async ({ page }) => useTheme(page, id));

    test("route: each stop's name, booked time and live time on one line, a late one too", async ({ page, errors }) => {
      // The 09:00 to Oxford: running late, so most rows carry a lateness ("+7"), which hangs under the live time
      // rather than pushing it up. The group the train is in opens by itself, so passing points are rows here too.
      await openTrain(page);
      const rows = await baselines(page.locator(".route__pt:not(.is-folded)"), [".route__place", ".route__booked", ".route__live"]);
      expect(rows.length).toBeGreaterThan(5);
      expect(offLine(rows)).toEqual([]);
      void errors;
    });

    test("route: each stop's ring on its name's first line, and the travelled line starting on the first", async ({ page, errors }) => {
      await openTrain(page);
      const off = await page.locator(".route__pt:not(.is-folded)").evaluateAll((rows) => rows.flatMap((row) => {
        const mark = row.querySelector(".route__mark")!;
        const ring = mark.getBoundingClientRect().top + parseFloat(getComputedStyle(mark, "::after").top);
        const range = document.createRange();
        range.selectNodeContents(row.querySelector(".route__place")!);
        const line = range.getClientRects()[0];
        const middle = (line.top + line.bottom) / 2;
        return Math.abs(ring - middle) > 2 ? [{ stop: row.querySelector(".route__place")!.textContent, ring, middle }] : [];
      }));
      expect(off).toEqual([]);
      const start = await page.locator(".route__pt").first().evaluate((row) => {
        const mark = row.querySelector(".route__mark")!;
        return mark.getBoundingClientRect().top + parseFloat(getComputedStyle(mark, "::after").top);
      });
      expect(Math.abs((await page.locator(".route__done").boundingBox())!.y - start)).toBeLessThan(1);
      void errors;
    });

    test("board: each train's time and destination on one line, a long name too", async ({ page, errors }) => {
      await open(page, "/board?station=PAD&time=09:00");
      const rows = await baselines(page.locator(".trains__link"), [".trains__time", ".trains__place"]);
      expect(rows.length).toBeGreaterThan(3);
      expect(offLine(rows)).toEqual([]);
      void errors;
    });

    test("Train view: the two ends' names, times and lateness each on one line", async ({ page, errors }) => {
      await openTrain(page);
      await page.getByRole("tab", { name: "Train view" }).click();
      await page.locator(".scene__ends").waitFor();
      const ends = page.locator(".scene__ends");
      // A name that wraps grows upwards, so the names share their last line, just above the times
      for (const [part, last] of [[".scene__where", true], [".scene__time", false], [".scene__late", false]] as const) {
        const ys = await ends.locator(part).evaluateAll((els, atEnd) => els.map((el) => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() ? 1 : 3) });
          let text = walker.nextNode();
          if (atEnd) for (let n = text; n; n = walker.nextNode()) text = n;
          if (!text) return null;
          const probe = document.createElement("span");
          probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
          text.parentNode!.insertBefore(probe, atEnd ? text.nextSibling : text);
          const y = probe.getBoundingClientRect().bottom;
          probe.remove();
          return y;
        }), last);
        const shown = ys.filter((y): y is number => y != null);
        if (shown.length > 1) expect(Math.max(...shown) - Math.min(...shown), part).toBeLessThanOrEqual(TOLERANCE);
      }
      void errors;
    });
  });
}
