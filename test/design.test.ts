// What a screenshot can't check: every text colour in the theme is readable on what it sits on (WCAG 4.5:1), in
// both light and dark, and the train marker stands out from the page (3:1 for graphics).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../public/css/themes/platform.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(css.split("@media")[0]);
const THEMES = { light, dark: { ...light, ...tokens(css.split("@media")[1] ?? "") } };

function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text colour, on every background it's used on. */
const TEXT_ON: Array<[string, string]> = [
  ["ink", "page"], ["muted", "page"], ["problem", "page"], ["late", "page"], ["very-late", "page"], ["early", "page"],
  ["ink", "surface"], ["muted", "surface"], ["late", "surface"], ["ink", "surface-2"], ["muted", "surface-2"],
  ["on-primary", "primary"], ["demo-ink", "demo"], ["on-sign", "sign"], ["train-edge", "train"], ["ink", "control"],
];

describe.each(Object.entries(THEMES))("the %s theme", (_name, t) => {
  it("defines every colour the checks use", () => {
    for (const [fg, bg] of TEXT_ON) expect([t[fg], t[bg]], `${fg} on ${bg}`).not.toContain(undefined);
  });

  it.each(TEXT_ON)("%s text on %s is readable (4.5:1)", (fg, bg) => {
    expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the train marker stands out from the page (3:1), by its edge if not its yellow", () => {
    // yellow on paper alone is about 1.4:1, so the marker always carries its dark edge
    expect(Math.max(contrast(t["train-edge"], t.page), contrast(t.train, t.page))).toBeGreaterThanOrEqual(3);
    expect(contrast(t["train-edge"], t.train)).toBeGreaterThanOrEqual(3);
  });
});
