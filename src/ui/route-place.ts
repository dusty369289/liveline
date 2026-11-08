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
