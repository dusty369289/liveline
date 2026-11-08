// Operator badges (the Operator colour theme): each operator's real short form, its brand colour, and text on it that
// reads. Names and colours: the owner asked for the real ones (notes/decisions.md, 2026-11-08, has the sources).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operatorBadge, OPERATORS } from "../src/ui/components/operators";
import { contrast } from "./support";

const css = readFileSync(new URL("../public/css/themes/operators.css", import.meta.url), "utf8");
const colours = Object.fromEntries([...css.matchAll(/\[data-op="([\w-]+)"\]\s*\{\s*--op-bg:\s*(#[0-9a-f]{6});\s*--op-ink:\s*(#[0-9a-f]{6});/gi)]
  .map(([, key, bg, ink]) => [key, { bg, ink }]));
const badge = (code: string, name = "") => String(operatorBadge(code, name));

describe("operator badges", () => {
  it.each(Object.keys(OPERATORS))("%s has a brand colour, with text on it that reads (4.5:1)", (key) => {
    expect(colours[key], `no colour for ${key} in operators.css`).toBeDefined();
    expect(contrast(colours[key].ink, colours[key].bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("colours no operator that has no name here", () => {
    expect(Object.keys(colours).filter((k) => !(k in OPERATORS))).toEqual([]);
  });

  it("use the operators' own short forms, as they write them", () => {
    expect(badge("GW")).toContain(">GWR<");
    expect(badge("GR")).toContain(">LNER<");
    expect(badge("CC")).toContain(">c2c<");
    expect(badge("AW")).toContain(">TfW<");
    expect(badge("XR")).toContain(">Elizabeth line<");
    expect(badge("SN")).toContain(">Southern<"); // no abbreviation of its own: the brand, not an invented one
  });

  it("tell London Northwestern from West Midlands Railway, which share a code, by the operator's name", () => {
    expect(badge("LM", "London Northwestern Railway")).toMatch(/data-op="LM-LNR"[^>]*>LNR</);
    expect(badge("LM", "West Midlands Railway")).toMatch(/data-op="LM-WMR"[^>]*>WMR</);
    expect(badge("LM", "West Midlands Trains")).toBe(""); // can't tell which: no badge rather than a guess
  });

  it("leave out an operator they don't know, and non-passenger moves (ZZ)", () => {
    expect(badge("ZZ")).toBe("");
    expect(badge("QQ")).toBe("");
    expect(badge("")).toBe("");
  });

  it("are hidden from screen readers, as the row says the operator's full name", () => {
    expect(badge("GW")).toContain('aria-hidden="true"');
  });
});
