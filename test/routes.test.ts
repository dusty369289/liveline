// A typed board time to an instant (ui/routes.ts when()): a morning time typed the evening before means tomorrow,
// and tomorrow is a calendar day, not 24 hours, on the nights the clocks change.
import { describe, expect, it } from "vitest";
import { fromLondon } from "../src/core/time";
import { when } from "../src/ui/routes";

describe("when()", () => {
  it("a morning time typed the evening before the clocks go forward lands on that morning's clock", () => {
    expect(when("03:00", "", fromLondon(2027, 3, 27, 21, 0))).toBe(fromLondon(2027, 3, 28, 3, 0));
  });

  it("and the evening before they go back", () => {
    expect(when("03:00", "", fromLondon(2026, 10, 24, 21, 0))).toBe(fromLondon(2026, 10, 25, 3, 0));
  });

  it("rolls over the end of a month", () => {
    expect(when("06:15", "", fromLondon(2027, 3, 31, 22, 0))).toBe(fromLondon(2027, 4, 1, 6, 15));
  });

  it("00:30 typed late at night means tonight", () => {
    expect(when("00:30", "", fromLondon(2026, 11, 7, 23, 10))).toBe(fromLondon(2026, 11, 8, 0, 30));
  });

  it("a time earlier today stays today, and a given day is taken as it is", () => {
    expect(when("09:00", "", fromLondon(2026, 11, 7, 12, 0))).toBe(fromLondon(2026, 11, 7, 9, 0));
    expect(when("03:00", "2026-11-07", fromLondon(2026, 11, 7, 21, 0))).toBe(fromLondon(2026, 11, 7, 3, 0));
  });

  it("refuses a bad time or day", () => {
    const now = fromLondon(2026, 11, 7, 12, 0);
    expect(() => when("25:00", "", now)).toThrow(RangeError);
    expect(() => when("9am", "", now)).toThrow(RangeError);
    expect(() => when("09:00", "7 Nov", now)).toThrow(RangeError);
  });
});
