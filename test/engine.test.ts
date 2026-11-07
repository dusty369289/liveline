// The engine's rules, each by name, so a change to one fails a test that says which (the golden answers in
// test/parity.test.ts only say that something changed).
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE, sectionFraction } from "../src/core/engine";

const M = 60_000;

describe("how far through a section", () => {
  it("is elapsed time over the expected run", () => {
    expect(sectionFraction(0, 10 * M, 0)).toBe(0);
    expect(sectionFraction(0, 10 * M, 5 * M)).toBe(0.5);
    expect(sectionFraction(0, 10 * M, -M)).toBe(0);
  });

  it(`never passes the hold (${DEFAULT_ENGINE.holdFraction}) of an unreported section`, () => {
    expect(sectionFraction(0, 10 * M, 9.5 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(0, 10 * M, 60 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(0, 10 * M, 60 * M, 0.8)).toBe(0.8);
  });

  it("holds when nothing is expected, or expected before it left", () => {
    expect(sectionFraction(0, null, 5 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(10 * M, 10 * M, 11 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(10 * M, 5 * M, 11 * M, 0.5)).toBe(0.5);
  });
});
