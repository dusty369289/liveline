// Between reports the marker runs on through passing points by the shown times, never past the next stop, and never
// goes back when a report comes in: it waits for the train to catch up (owner, 2026-11-09: four passing points in a
// minute had it sit, then jump four).
import { describe, expect, it } from "vitest";
import { estimateAlong, keepAhead, type RowTimes } from "../src/ui/route-place";

const S = 1000;
const T = Date.UTC(2026, 10, 9, 9, 0);
const HOLD = 0.95;
// left a station at T, then four passing points 15 s apart, then a stop at T + 90 s, then a pass at T + 120 s
const rows: RowTimes[] = [
  { tin: T, tout: T, call: true },
  { tin: T + 15 * S, tout: T + 15 * S, call: false },
  { tin: T + 30 * S, tout: T + 30 * S, call: false },
  { tin: T + 45 * S, tout: T + 45 * S, call: false },
  { tin: T + 60 * S, tout: T + 60 * S, call: false },
  { tin: T + 90 * S, tout: T + 120 * S, call: true },
  { tin: T + 150 * S, tout: T + 150 * S, call: false },
];

describe("where the marker runs between reports", () => {
  it("in the section the shown times put it in", () => {
    expect(estimateAlong(rows, 0, T + 7.5 * S, HOLD)).toEqual({ a: 0, b: 1, f: 0.5 });
  });

  it("on through passing points that haven't reported", () => {
    expect(estimateAlong(rows, 0, T + 37.5 * S, HOLD)).toEqual({ a: 2, b: 3, f: 0.5 });
  });

  it("never past the next stop: it holds just short of it", () => {
    expect(estimateAlong(rows, 0, T + 89 * S, HOLD).b).toBe(5);
    expect(estimateAlong(rows, 0, T + 200 * S, HOLD)).toEqual({ a: 4, b: 5, f: HOLD });
  });

  it("on through two passing points timed to the same minute, as RTT often books them", () => {
    const same = rows.map((r, i) => (i === 3 ? { ...r, tin: T + 30 * S, tout: T + 30 * S } : r)); // 2 and 3 both at +30 s
    expect(estimateAlong(same, 0, T + 31 * S, HOLD).a).toBe(3);
  });

  it("holds when a time it needs is missing", () => {
    const gaps = rows.map((r, i) => (i === 2 ? { ...r, tin: null, tout: null } : r));
    expect(estimateAlong(gaps, 0, T + 40 * S, HOLD)).toEqual({ a: 1, b: 2, f: HOLD });
  });
});

describe("a report that puts the train behind the marker", () => {
  it("doesn't send it back: it waits where it got to", () => {
    expect(keepAhead(3.4, 2.8, false)).toBe(3.4);
    expect(keepAhead(2.1, 2.8, false)).toBe(2.8); // ahead of where it was: on it goes
  });

  it("but when the next point is overdue, it goes back, to where the train was last reported", () => {
    expect(keepAhead(3.4, 0.95, true)).toBe(0.95);
  });
});
