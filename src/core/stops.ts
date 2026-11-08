// Your stops on a train: which calls are where you get on and off, and how things stand at each. Read from the
// engine's Timeline, so the train page and the polling (poll.ts) agree.
import { GIVEN_UP, type Shown, type Timeline } from "./engine";
import { isCancelled, isEmpty } from "./models";

export interface StopSummary {
  name: string;
  index: number;
  shown: Shown | null;
  platform: string | null;
  platformConfirmed: boolean;
  status: "ahead" | "here" | "gone" | "cancelled";
  minutes: number | null; // from now until the train is due there (ahead and still followed only)
  callsBetween: number; // stops between the train and this one
  timetableOnly: boolean; // ahead, but we've given up on the train (GIVEN_UP): `shown` is the timetable, no countdown
}

export interface YourStops {
  at: number | null; // the point index where you get on
  to: number | null; // and where you get off
}

/**
 * Which calls are yours when a station comes up more than once (a loop, or a train that reverses): you get on at the
 * first call there with a departure, and off at the first call there with an arrival after that. Judged on the
 * timetable as RTT sent it, so a cancelled departure is still where you meant to board (and shows as cancelled).
 */
export function resolveStops(tl: Timeline, at: string, to: string): YourStops {
  const sent = tl.service.points;
  const callsAt = (code: string): number[] => {
    const c = code.trim().toUpperCase();
    return c ? sent.flatMap((p, i) => (p.kind === "call" && (p.crs === c || p.tiploc === c) ? [i] : [])) : [];
  };
  const ons = callsAt(at);
  const on = ons.find((i) => !isEmpty(sent[i].departure)) ?? ons[0] ?? null;
  const offs = callsAt(to);
  const after = offs.filter((i) => on == null || i > on);
  const pool = after.length ? after : offs; // a stop before where you get on: show it rather than nothing
  const off = pool.find((i) => !isEmpty(sent[i].arrival)) ?? pool[0] ?? null;
  return { at: on, to: off };
}

/** Where you get on and off, summarised: the train page and the polling ask this once, so they agree. */
export function yourStops(tl: Timeline, at: string, to: string): [StopSummary | null, StopSummary | null] {
  const r = resolveStops(tl, at, to);
  return [stopSummary(tl, at, true, r.at), stopSummary(tl, to, false, r.to)];
}

/**
 * How things stand at one station on this train: where you get on (or off). `index` is the call (resolveStops);
 * left out, it's the first call there that suits.
 */
export function stopSummary(tl: Timeline, code: string, boarding = true, index?: number | null): StopSummary | null {
  const i = index !== undefined ? index : boarding ? resolveStops(tl, code, "").at : resolveStops(tl, "", code).to;
  if (i == null) return null;
  const v = tl.points[i];
  const p = v.point;
  const sh = boarding ? (v.departure ?? v.arrival) : (v.arrival ?? v.departure);
  const pos = tl.position;
  // A train terminated short still arrives where it now ends, but you can't board it there (and the reverse where it
  // now starts): the flags are on the point as RTT sent it, since the as-run point has those events taken out
  const sent = tl.service.points[v.index];
  const cancelled = isCancelled(p) || (boarding ? sent.departure.cancelled : sent.arrival.cancelled);
  const status = cancelled ? "cancelled" : pos.state === "at-station" && pos.fromIndex === v.index ? "here" : v.reported ? "gone" : "ahead";
  const timetableOnly = status === "ahead" && GIVEN_UP.includes(pos.state);
  let minutes: number | null = null;
  let between = 0;
  if (status === "ahead" && !timetableOnly) {
    if (sh && sh.time != null) minutes = Math.max(Math.floor((sh.time - tl.now) / 60_000), 0);
    const start = pos.fromIndex ?? -1;
    between = tl.points.slice(start + 1, v.index).filter((w) => w.point.kind === "call" && !isCancelled(w.point)).length;
  }
  return { name: p.name, index: v.index, shown: sh, platform: p.platform, platformConfirmed: p.platformConfirmed, status, minutes,
    callsBetween: between, timetableOnly };
}
