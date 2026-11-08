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

// The token pairs above can all pass while the cascade picks another pair: a bare .is-changed elsewhere once turned a
// changed plate's number amber on navy. So work out what the stylesheets give the board's platform plate, in the
// order app.css loads them (layer, then specificity, then source order). Only class-only selectors are weighed,
// which is all that styles the plate today.
const cssDir = new URL("../public/css/", import.meta.url);
const app = readFileSync(new URL("app.css", cssDir), "utf8");
const layerOrder = app.match(/@layer ([^;]+);/)![1].split(",").map((s) => s.trim());
const sheets = [...app.matchAll(/@import url\("\.\/([^"]+)"\) layer\((\w+)\)/g)].map(([, file, layer]) => ({ file, layer }));

interface Rule { selector: string; decls: Record<string, string>; layer: number; order: number }
function rules(): Rule[] {
  const out: Rule[] = [];
  for (const { file, layer } of sheets) {
    const text = readFileSync(new URL(file, cssDir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // Flatten @media blocks: at phone width the max-width ones apply, and none of them colours the plate
    for (const m of text.replace(/@media[^{]+\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = Object.fromEntries(m[2].split(";").map((d) => d.split(/:(.*)/s).map((s) => s.trim())).filter((d) => d[1]));
      for (const selector of m[1].split(",")) out.push({ selector: selector.trim(), decls, layer: layerOrder.indexOf(layer), order: out.length });
    }
  }
  return out;
}
const RULES = rules();

/** The value the cascade gives `prop` on an element with these classes. */
function computed(classes: string[], prop: string): string | undefined {
  const hits = RULES.filter((r) => prop in r.decls && /^(\.[\w-]+)+$/.test(r.selector)
    && r.selector.slice(1).split(".").every((c) => classes.includes(c)));
  const weight = (r: Rule) => [r.layer, r.selector.split(".").length, r.order];
  hits.sort((a, b) => weight(a).reduce((d, w, i) => d || w - weight(b)[i], 0));
  return hits.at(-1)?.decls[prop];
}

describe.each(Object.entries(THEMES))("the board's platform plate, %s", (_name, t) => {
  const token = (v: string | undefined) => t[v?.match(/var\(--([\w-]+)\)/)?.[1] ?? ""];
  const ground = (classes: string[]) => {
    const bg = computed(classes, "background");
    return bg === "transparent" ? t.page : token(bg);
  };

  it.each([
    ["confirmed", ["trains__plat"]],
    ["not confirmed", ["trains__plat", "is-unconfirmed"]],
    ["changed", ["trains__plat", "is-changed"]],
    ["changed, not confirmed", ["trains__plat", "is-unconfirmed", "is-changed"]],
  ])("%s: the number is readable (4.5:1)", (_state, classes) => {
    const fg = token(computed(classes, "color"));
    expect(fg, `colour of .${classes.join(".")}`).toBeDefined();
    expect(contrast(fg, ground(classes))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["changed", ["trains__plat", "is-changed"]],
    ["changed, not confirmed", ["trains__plat", "is-unconfirmed", "is-changed"]],
  ])("%s: keeps the yellow change bar", (_state, classes) => {
    expect(computed(classes, "box-shadow")).toContain("var(--train)");
  });
});
