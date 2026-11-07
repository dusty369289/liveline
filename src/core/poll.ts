// When to ask RTT about a train again. The allowance is 10 a minute and 100 an hour, and RTT only learns something new
// when the train reaches a timing point, so polling on a fixed beat mostly re-fetches the same answer. Instead: wait
// until the next report could exist, and stop once nothing more can change for the train. The marker keeps moving
// between polls on its own (live.ts), so a slower poll doesn't freeze the picture.
import { stopSummary, type Timeline } from "./engine";
import type { Ms } from "./time";

export const POLL = {
  min: 60, // never sooner, whatever the train is doing: about 60 calls an hour at most, leaving room to search
  running: 60, // between points: just after the next report is due, but not more than once a minute
  max: 120, // never later while it's moving, so a surprise (cancellation, platform change) shows within 2 minutes
  notStartedMax: 180, // before it sets off: platform changes and cancellations still show within 3 minutes
  wakeBefore: 2 * 3600, // ...but only from 2 hours before: earlier, nothing you'd act on changes minute to minute
  notStartedFar: 30 * 60, // further off (a train tomorrow): every half hour, two an hour instead of twenty
  afterDue: 20, // a report lands in RTT a little after the event
  overdue: 60, // no report where one was expected: check every minute
  farAway: 120, // your stop is over 40 minutes off: no need to be quicker than this
  farMinutes: 40,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** Manual refresh may go faster than the automatic polls, but never into the calls kept for searches. */
export const MANUAL = {
  fast: 15, // seconds an answer must be old before Refresh fetches again, while the hour has plenty left
  slow: 60, // once the hour runs low
  lowBelow: 30, // "low": this many calls left or fewer
};

/**
 * How old an answer must be before a tapped Refresh fetches again, or null when Refresh mustn't fetch at all because
 * only the hour's reserve (kept for searches) is left. Below that the tap shows the current answer and says why.
 */
export function manualMinAge(hourLeft: number, reserve: number): number | null {
  if (hourLeft <= reserve) return null;
  return hourLeft <= MANUAL.lowBelow ? MANUAL.slow : MANUAL.fast;
}

/**
 * Seconds until the next poll, or null to stop (it arrived, is cancelled, or there's no data). Passing your own stop
 * doesn't stop it: you may want to watch it carry on, and nothing polls unless the train page is on screen.
 * `budgetSecs` is the allowance's own floor (Budget.refreshInterval); the answer is never sooner than that.
 */
export function pollAfter(tl: Timeline, now: Ms, budgetSecs: number, at = ""): number | null {
  const p = tl.position;
  if (p.state === "arrived" || p.state === "cancelled" || p.state === "no-data") return null;

  const secsTo = (t: Ms | null) => (t == null ? null : (t - now) / 1000);
  let s: number;
  if (p.state === "not-started") {
    const due = secsTo(p.expected);
    if (due == null) s = POLL.notStartedMax;
    else if (due > POLL.wakeBefore) s = Math.max(POLL.notStartedMax, Math.min(due - POLL.wakeBefore, POLL.notStartedFar));
    else s = clamp(due - 60, 60, POLL.notStartedMax);
  } else if (p.state === "overdue" || p.state === "at-origin") {
    s = POLL.overdue;
  } else if (p.state === "at-station") {
    const dep = p.fromIndex != null ? tl.points[p.fromIndex].departure?.time ?? null : null;
    const due = secsTo(dep);
    s = due == null ? POLL.overdue : clamp(due + POLL.afterDue, POLL.min, POLL.max);
  } else {
    const due = secsTo(p.expected);
    s = due == null ? 90 : clamp(due + POLL.afterDue, POLL.running, POLL.max);
  }
  const mine = at ? stopSummary(tl, at) : null;
  if (mine && mine.status === "ahead" && mine.minutes != null && mine.minutes > POLL.farMinutes) s = Math.max(s, POLL.farAway);
  return Math.round(Math.max(s, budgetSecs, POLL.min));
}
