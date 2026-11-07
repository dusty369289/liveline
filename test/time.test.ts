// UK time without the device's timezone data (core/time.ts), pinned on the two nights the clocks change, where a
// wrong offset puts a train an hour out.
import { describe, expect, it } from "vitest";
import { fromLondon, hm, londonOffset, parseTime } from "../src/core/time";

describe("UK time on the nights the clocks change", () => {
  it("the offset changes at 01:00 UTC on the last Sunday of March and of October", () => {
    expect(londonOffset(Date.UTC(2027, 2, 28, 0, 59))).toBe(0);
    expect(londonOffset(Date.UTC(2027, 2, 28, 1, 0))).toBe(60);
    expect(londonOffset(Date.UTC(2026, 9, 25, 0, 59))).toBe(60);
    expect(londonOffset(Date.UTC(2026, 9, 25, 1, 0))).toBe(0);
  });

  it("01:30 on the March night doesn't exist: it is read with summer time's offset, an hour before 01:30 GMT", () => {
    expect(fromLondon(2027, 3, 28, 1, 30)).toBe(Date.UTC(2027, 2, 28, 0, 30));
    expect(fromLondon(2027, 3, 28, 2, 0)).toBe(Date.UTC(2027, 2, 28, 1, 0)); // 02:00 BST, the first real reading
  });

  it("01:30 on the October night happens twice: the earlier one (still summer time) wins", () => {
    expect(fromLondon(2026, 10, 25, 1, 30)).toBe(Date.UTC(2026, 9, 25, 0, 30));
    expect(hm(fromLondon(2026, 10, 25, 1, 30))).toBe("01:30");
    expect(fromLondon(2026, 10, 25, 2, 0)).toBe(Date.UTC(2026, 9, 25, 2, 0)); // 02:00 GMT
  });

  it("reads a July time as UK summer time without an offset, and trusts one when given", () => {
    expect(parseTime("2026-07-01T09:00:00")).toBe(Date.UTC(2026, 6, 1, 8, 0));
    expect(parseTime("2026-07-01T09:00:00+01:00")).toBe(Date.UTC(2026, 6, 1, 8, 0));
    expect(parseTime("2026-07-01T09:00:00Z")).toBe(Date.UTC(2026, 6, 1, 9, 0));
  });
});
