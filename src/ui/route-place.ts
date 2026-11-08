// Where the train marker sits between two rows of the route, in pixels. Pure: live-marker.ts measures the rows.

/** px a departed train sits clear of the point it left (and of the next), so it never looks to be on a ring. */
export const MIN_AWAY = 26;

/**
 * The marker's y between row centres `a` and `b`, `f` (0..1) of the way through. It keeps `minAway` clear of both
 * ends, or half the gap on a section too short for that, so a train just gone or nearly there still reads as between.
 */
export function clampBetween(a: number, b: number, f: number, minAway = MIN_AWAY): number {
  const gap = Math.min(minAway, (b - a) / 2);
  return Math.min(a + Math.max((b - a) * f, gap), b - gap);
}
