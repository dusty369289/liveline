// Where the train marker sits between two rows of the route, in pixels. Pure: live-marker.ts measures the rows.

/** px a departed train sits clear of a station it left (and of the next), so it never looks to be on its ring. */
export const MIN_AWAY = 26;
/** px it sits clear of a passing point: a small tick, not a ring, so the marker needs only to not cover it. */
export const PASS_AWAY = 6;
/**
 * The most of a section the clear space at its two ends may take. Passing points' rows are ~37 px apart: keeping a
 * full MIN_AWAY (or half the gap) clear of both pinned the train to the middle until the next report (owner,
 * 2026-11-08). Shrinking both ends to fit leaves at least a third of every section to move along.
 */
export const MAX_CLEAR = 2 / 3;

/** A route row's shown times (the report, else RTT's forecast or our estimate) and whether the train stops there. */
export interface RowTimes { tin: number | null; tout: number | null; call: boolean }

/**
 * Where the train is between reports, from the last reported row `from`, by the rows' shown times: on through passing
 * points that haven't reported (four can pass in a minute, between two polls; owner, 2026-11-09), but never past the
 * next stop, where it holds at `hold` of the way, as the train may be standing there. A row with no time holds it too.
 * `a` and `b` are the rows it's between, `f` (0..1) how far.
 */
export function estimateAlong(rows: RowTimes[], from: number, now: number, hold: number): { a: number; b: number; f: number } {
  for (let a = from; a + 1 < rows.length; a++) {
    const b = a + 1;
    const start = rows[a].tout ?? rows[a].tin;
    const end = rows[b].tin ?? rows[b].tout;
    if (start == null || end == null) return { a, b, f: hold };
    // two points timed alike (RTT often books passes to the same minute) are passed in no time, not a reason to stop
    if (now < end) return { a, b, f: end > start ? Math.max(0, (now - start) / (end - start)) : 0 };
    if (rows[b].call) return { a, b, f: hold };
  }
  return { a: from, b: from, f: 0 };
}

/**
 * Where the marker goes once an answer has placed the train at `next` (rows along the route, `a + f`), having got to
 * `reached`: never back, as a train sliding backwards looks worse than one that waits for reality to catch up. Unless
 * a point is `overdue` (no report 2 minutes after it was due): then the estimate was wrong, and it goes back to hold
 * short of it.
 */
export const keepAhead = (reached: number, next: number, overdue: boolean): number =>
  overdue ? next : Math.max(reached, next);

/**
 * The marker's y between row centres `a` and `b`, `f` (0..1) of the way through, keeping `awayA` clear of the row
 * it left and `awayB` of the next, both shrunk in proportion on a section too short for them (MAX_CLEAR).
 */
export function clampBetween(a: number, b: number, f: number, awayA = MIN_AWAY, awayB = awayA): number {
  const gap = b - a;
  const scale = Math.min(1, (gap * MAX_CLEAR) / Math.max(awayA + awayB, 1e-9));
  const lo = a + awayA * scale;
  const hi = b - awayB * scale;
  return Math.min(Math.max(a + gap * f, lo), hi);
}
