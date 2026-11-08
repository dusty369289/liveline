// Where the train is, and when it'll reach each point. Pure functions of (service, now).
// test/parity.test.ts holds it to the frozen golden answers (test/golden/README.md).
//
// Display time for each event, in order of trust: RTT actual > RTT forecast > RTT's no-report estimate > ours > booked.
// Our estimate carries the latest known delay forward along the working timetable. A late train can win back the
// booked allowances in each section and dwell beyond `minDwell`, but never runs ahead of the working timetable and
// never leaves a public stop before its booked time. `recoveryShare` is a guess until backtested.
import {
  allowanceTotal,
  booked as bookedOf,
  emptyTimes,
  firstEvent,
  isCancelled,
  isEmpty,
  lastEvent,
  planned,
  type Feed,
  type Point,
  type Service,
  type Times,
  type TimeSource,
} from "./models";
import { hm, type Ms } from "./time";

export interface EngineConfig {
  recoveryShare: number;
  minDwell: Ms;
  holdFraction: number; // never place the train past this share of an unreported section
  overdueAfter: Ms;
  giveUpAfter: Ms; // past the latest time expected at its end (dueAtEnd) by this much, no report is coming: stop waiting
}

export const DEFAULT_ENGINE: EngineConfig = {
  recoveryShare: 0.75,
  minDwell: 30_000,
  holdFraction: 0.95,
  overdueAfter: 120_000,
  // Half an hour past when it's expected at its end covers a late report or a train held outside; the expected time
  // moves on with each report, so a late train still reporting is followed. Polling a lost train for ever wastes the hour.
  giveUpAfter: 30 * 60_000,
};

/**
 * "unreported": reported on the way, but not at its end, long after it was due there (giveUpAfter). It may have
 * arrived unseen, or been terminated early without RTT saying so: we say only what we know.
 */
export type State = "not-started" | "at-origin" | "at-station" | "running" | "overdue" | "arrived" | "cancelled" | "no-data"
  | "unreported";
/** States where we've stopped following the train: what it hasn't reached shows the timetable, never our estimate. */
export const GIVEN_UP: readonly State[] = ["no-data", "unreported"];

export interface Shown {
  time: Ms | null;
  source: TimeSource;
  booked: Ms | null;
  delayMin: number | null; // against the booked time shown, whole minutes, + is late
}
export const changed = (s: Shown) => s.time != null && s.booked != null && Math.abs(s.time - s.booked) >= 60_000;

export interface PointView {
  index: number;
  point: Point;
  arrival: Shown | null;
  departure: Shown | null;
  passing: Shown | null;
  reported: boolean; // the train has been reported at or beyond here
  oursArrival: Ms | null;
  oursDeparture: Ms | null;
}

export interface Position {
  state: State;
  fromIndex: number | null; // last point reported
  toIndex: number | null; // next point
  since: Ms | null; // when it left/passed fromIndex
  expected: Ms | null; // when we expect it at toIndex
  fraction: number; // 0..1 through the section at `now`
  delayMin: number | null; // current lateness against the working timetable
  headline: string;
}

export interface Lost {
  fromName: string;
  toName: string;
  minutes: number;
}

export interface Timeline {
  service: Service;
  points: PointView[];
  position: Position;
  now: Ms;
  worst: Lost | null; // the section that lost the most time, if it lost at least 2 minutes
}

/**
 * How far through a section the train is at `now`, by elapsed time against the run expected from `since` (when it
 * left) to `expected`. It never passes `hold`: an unreported point is never passed. Shared with live-train.ts, which
 * moves the marker every second between answers.
 */
export function sectionFraction(since: Ms, expected: Ms | null, now: Ms, hold = DEFAULT_ENGINE.holdFraction): number {
  if (expected == null || expected <= since) return hold;
  return Math.min(Math.max((now - since) / (expected - since), 0), hold);
}

/** Railway convention: lateness is whole minutes, rounded toward zero. */
export const roundMin = (seconds: number) => (seconds >= 0 ? Math.floor(seconds / 60) : -Math.floor(-seconds / 60));

const STALE = 60_000;
/** A forecast earlier than the train could possibly get there is stale (a minute's slack for rounding). */
const fresh = (t: Ms | null, floor: Ms): Ms | null => (t != null && t >= floor - STALE ? t : null);
const max = (...xs: Ms[]) => Math.max(...xs);

function shown(t: Times, ours: Ms | null, floor: Ms, ahead: boolean): Shown | null {
  if (isEmpty(t) && ours == null) return null;
  const booked = bookedOf(t);
  const forecast = ahead && ours != null ? fresh(t.forecast, floor) : t.forecast;
  const estimate = ahead && ours != null ? fresh(t.estimate, floor) : t.estimate;
  let time: Ms | null;
  let source: TimeSource;
  if (t.actual != null) [time, source] = [t.actual, "actual"];
  else if (forecast != null) [time, source] = [forecast, "forecast"];
  else if (estimate != null) [time, source] = [estimate, "rtt-estimate"];
  else if (ours != null) [time, source] = [ours, "est"];
  else [time, source] = [booked, "booked"];
  const delayMin = time != null && booked != null ? roundMin((time - booked) / 1000) : null;
  return { time, source, booked, delayMin };
}

/** The latest actual at this point and which event it belongs to. */
function actualOf(p: Point): [Ms | null, Times | null] {
  const events = p.kind === "call" ? [p.departure, p.passing, p.arrival] : [p.passing];
  for (const t of events) if (t.actual != null) return [t.actual, t];
  return [null, null];
}

/**
 * Where the train is known to have been: an actual, or an event RTT flags as passed without a report
 * (`realtimeNoReport`), timed by RTT's estimate or forecast, else the working timetable. Only actuals count for lateness.
 */
function passedOf(p: Point): [Ms | null, Times | null] {
  const seen = actualOf(p);
  if (seen[0] != null) return seen;
  const events = p.kind === "call" ? [p.departure, p.passing, p.arrival] : [p.passing];
  for (const t of events) if (t.noReport) return [t.estimate ?? t.forecast ?? planned(t), t];
  return [null, null];
}

/**
 * The point as the train will run it: a cancelled arrival or departure at a stop it still makes (a train terminated
 * short, or starting part way) is no event at all, so nothing is shown or estimated for it. parse.ts keeps the flag,
 * which the board needs (rowCancelled). A wholly cancelled point is left as it is: it's out of the running anyway.
 */
function asRun(p: Point): Point {
  if (isCancelled(p) || !(p.arrival.cancelled || p.departure.cancelled)) return p;
  return { ...p, arrival: p.arrival.cancelled ? emptyTimes() : p.arrival, departure: p.departure.cancelled ? emptyTimes() : p.departure };
}

/** `feed` is RTT's own state (models.feedOf): with no live data, a missing report is the feed, not the train. */
export function build(service: Service, now: Ms, cfg: EngineConfig = DEFAULT_ENGINE, feed: Feed = "ok"): Timeline {
  const pts = service.points.map(asRun);
  const usable = pts.map((p, i) => (isCancelled(p) ? -1 : i)).filter((i) => i >= 0);

  let last: number | null = null; // the last point it's known to have reached
  for (const i of usable) if (passedOf(pts[i])[0] != null) last = i;

  // --- our estimates, propagated forward from the last report (or from the start if none) ---
  const oursArr = new Map<number, Ms>();
  const plannedArr = new Map<number, Ms>(); // what we'd expect if nothing had held it up since the last report
  const oursDep = new Map<number, Ms>();
  let cursor: Ms | null = null; // time the train leaves the previous usable point
  // The earliest it could physically be anywhere: from where it is now, at its fastest booked running. A forecast
  // earlier than this is stale (typically a train held since RTT last forecast), so ours is shown instead.
  let floor: Ms = now;
  const floorArr = new Map<number, Ms>();
  const floorDep = new Map<number, Ms>();
  let prev: number | null = null;
  const start = last != null ? usable.indexOf(last) : 0;
  for (let k = start; k < usable.length; k++) {
    const i = usable[k];
    const p = pts[i];
    if (k === start) {
      if (last == null) {
        // Not yet reported: it leaves on time, or now if already overdue to start
        const first = planned(lastEvent(p));
        cursor = first != null ? max(first, now) : null;
      } else {
        const [act, ev] = passedOf(p) as [Ms, Times];
        if (p.kind === "call" && ev === p.arrival && !isEmpty(p.departure)) {
          // arrived, not yet departed: departs after a minimum dwell, not before booked
          let dep = max(act + cfg.minDwell, planned(p.departure) ?? act);
          if (p.departure.actual == null) dep = max(dep, now);
          oursDep.set(i, dep);
          cursor = dep;
          floor = max(now, act + cfg.minDwell);
        } else {
          cursor = act;
          floor = act;
        }
      }
      prev = i;
      continue;
    }
    if (cursor == null || prev == null) break;
    const aPrev = planned(lastEvent(pts[prev]));
    const aHere = planned(firstEvent(p));
    if (aPrev == null || aHere == null) {
      prev = i;
      continue;
    }
    const bookedRun = (aHere - aPrev) / 1000;
    const slack = allowanceTotal(pts[prev].allowances) * cfg.recoveryShare;
    const minRun = Math.max(bookedRun - slack, bookedRun * 0.5, 0);
    // it can't reach a point it hasn't been reported at before now, so a held train pushes everything back
    const fastest = Math.max(bookedRun - allowanceTotal(pts[prev].allowances), bookedRun * 0.7, 0);
    floor = max(floor + fastest * 1000, now);
    floorArr.set(i, floor);
    plannedArr.set(i, max(cursor + minRun * 1000, aHere));
    const arr = max(plannedArr.get(i)!, floor);
    oursArr.set(i, arr);
    // RTT knows more than we do, so where it has forecast a point, carry on from its time instead of ours
    const fe = firstEvent(p);
    const anchor = fresh(fe.forecast, floor) ?? fresh(fe.estimate, floor);
    const base = anchor ?? arr;
    if (p.kind === "pass") {
      cursor = base;
    } else {
      const depPlanned = planned(p.departure);
      if (depPlanned != null) {
        const dwell = Math.min(cfg.minDwell, Math.max(depPlanned - (planned(p.arrival) ?? depPlanned), 0));
        const dep = max(base + dwell, depPlanned);
        oursDep.set(i, dep);
        floor = floor + dwell;
        floorDep.set(i, floor);
        cursor = fresh(p.departure.forecast, floor) ?? fresh(p.departure.estimate, floor) ?? dep;
      } else {
        cursor = base;
      }
    }
    prev = i;
  }

  // `givenUp`: what it hasn't reached shows the timetable alone, since the headline says that's all we have
  const viewsOf = (givenUp: boolean): PointView[] => pts.map((p, i) => {
    const reported = last != null && i <= last;
    const show = (t: Times, ours: Ms | null, floor: Ms) => (givenUp && !reported ? timetable(t) : shown(t, ours, floor, !reported));
    const oa = oursArr.get(i) ?? null;
    if (p.kind === "pass") {
      return {
        index: i,
        point: p,
        arrival: null,
        departure: null,
        passing: show(p.passing, oa, floorArr.get(i) ?? now),
        reported,
        oursArrival: oa,
        oursDeparture: null,
      };
    }
    const od = oursDep.get(i) ?? null;
    return {
      index: i,
      point: p,
      arrival: isEmpty(p.arrival) ? null : show(p.arrival, oa, floorArr.get(i) ?? now),
      departure: isEmpty(p.departure) ? null : show(p.departure, od, floorDep.get(i) ?? now),
      passing: null,
      reported,
      oursArrival: oa,
      oursDeparture: od,
    };
  });

  const followed = viewsOf(false);
  const pos = position(pts, followed, usable, last, now, cfg, plannedArr, feed);
  return {
    service,
    points: GIVEN_UP.includes(pos.state) ? viewsOf(true) : followed,
    position: pos,
    now,
    worst: worst(pts, usable, last),
  };
}

/** The booked time alone, as `shown` gives it when there's nothing else. */
function timetable(t: Times): Shown | null {
  if (isEmpty(t)) return null;
  const booked = bookedOf(t);
  return { time: booked, source: "booked", booked, delayMin: booked != null ? 0 : null };
}

/** The section where lateness grew most. Timing points make this finer than station-to-station. */
function worst(pts: Point[], usable: number[], last: number | null): Lost | null {
  if (last == null) return null;
  let prev: [number, number] | null = null;
  let best: [number, number, number] | null = null;
  for (const i of usable) {
    if (i > last) break;
    const [act, ev] = actualOf(pts[i]);
    const pl = ev ? planned(ev) : null;
    if (act == null || ev == null || pl == null) continue;
    const late = (act - pl) / 1000;
    if (prev) {
      const grew = late - prev[1];
      if (!best || grew > best[0]) best = [grew, prev[0], i];
    }
    prev = [i, late];
  }
  if (!best || best[0] < 120) return null;
  return { fromName: pts[best[1]].name, toName: pts[best[2]].name, minutes: Math.floor(best[0] / 60) };
}

function expectedAt(v: PointView): Ms | null {
  const s = v.point.kind === "pass" ? v.passing : (v.arrival ?? v.departure);
  return s ? s.time : null;
}

/** Why a report is missing when RTT itself says it has no live data: never blame a signal for that. */
const NO_FEED = "Realtime Trains has no live data right now, so no reports are coming in.";

function lateText(d: number | null): string {
  if (d == null) return "";
  if (d === 0) return "on time";
  return d > 0 ? `${d} min late` : `${-d} min early`;
}

/**
 * The latest time the train is expected at its end: booked, RTT's forecast or estimate there, and, once reported, the
 * last report plus the booked running time from there, or our estimate from the last report. Our estimate never
 * counts before a report, nor with the hold: both start from now, so it would never fall behind and we'd wait for ever.
 */
function dueAtEnd(pts: Point[], endIx: number, last: number | null, plannedArr: Map<number, Ms>): Ms | null {
  const fe = firstEvent(pts[endIx]);
  const times = [bookedOf(fe), fe.forecast, fe.estimate];
  if (last != null) {
    const [act, ev] = passedOf(pts[last]);
    const from = ev ? planned(ev) : null;
    const to = planned(fe);
    if (act != null && from != null && to != null) times.push(act + Math.max(to - from, 0));
    times.push(plannedArr.get(endIx) ?? null);
  }
  const known = times.filter((t): t is Ms => t != null);
  return known.length ? max(...known) : null;
}

function position(
  pts: Point[],
  views: PointView[],
  usable: number[],
  last: number | null,
  now: Ms,
  cfg: EngineConfig,
  plannedArr: Map<number, Ms>,
  feed: Feed,
): Position {
  const P = (state: State, fromIndex: number | null, toIndex: number | null, since: Ms | null, expected: Ms | null,
    fraction: number, delayMin: number | null, headline: string): Position =>
    ({ state, fromIndex, toIndex, since, expected, fraction, delayMin, headline });
  if (!pts.length) return P("no-data", null, null, null, null, 0, null, "No route data for this train.");
  if (!usable.length) return P("cancelled", null, null, null, null, 0, null, "This train is cancelled.");

  // Long past the latest time it's expected at its end, with nothing there: no more reports are coming, so stop
  // waiting for one. A late train that's still reporting moves that time on, so it's still followed.
  const endIx = usable[usable.length - 1];
  const end = pts[endIx];
  const dueIn = bookedOf(firstEvent(end));
  const latest = dueAtEnd(pts, endIx, last, plannedArr);
  const pastEnd = latest != null && now > latest + cfg.giveUpAfter;

  if (last == null) {
    if (pastEnd) {
      return P("no-data", null, null, null, null, 0, null,
        `No reports for this train: it was due at ${end.name} at ${hm(dueIn)}. The times shown are the timetable.`);
    }
    const first = usable[0];
    const p = pts[first];
    const dep = planned(p.departure) ?? planned(lastEvent(p));
    if (dep != null && now < dep) {
      return P("not-started", null, first, null, dep, 0, null, `Not started yet. Due to leave ${p.name} at ${hm(dep)}.`);
    }
    return P("at-origin", first, usable.length > 1 ? usable[1] : null, null, null, 0, null,
      (dep != null ? `No reports yet. It was due to leave ${p.name} at ${hm(dep)}.` : "No reports yet.") +
        (feed === "none" ? ` ${NO_FEED}` : ""));
  }

  const lp = pts[last];
  const [act, ev] = passedOf(lp) as [Ms, Times];
  const seen = ev.actual != null; // false: RTT says it got here, with no report to time it
  const pl = planned(ev);
  const delay = seen && pl != null ? roundMin((act - pl) / 1000) : null;
  // The words say what the row says: lateness against the public time (working time where there's none). `delay`
  // stays on the working timetable, which is what the estimate runs on.
  const lv = views[last];
  const reportedShown = ev === lp.arrival ? lv.arrival : ev === lp.departure ? lv.departure : lv.passing;
  const late = lateText(seen ? (reportedShown?.delayMin ?? delay) : null);
  const where = seen ? `${lp.name} ${hm(act)}` : `${lp.name} (not reported)`;
  const verb = lp.kind === "pass" ? "Passed" : ev === lp.arrival ? "Reached" : "Left";

  const nxtK = usable.indexOf(last) + 1;
  if (nxtK >= usable.length) {
    return P("arrived", last, null, act, null, 1, delay, seen ? `Arrived at ${where}, ${late}.` : `Arrived at ${where}.`);
  }
  const nxt = usable[nxtK];
  if (pastEnd) {
    return P("unreported", last, null, act, null, 0, delay,
      `Last reported: ${verb.toLowerCase()} ${where}. Its arrival at ${end.name} was not reported, so this is all we know.`);
  }

  if (lp.kind === "call" && ev === lp.arrival && !isEmpty(lp.departure)) {
    const due = views[last].departure ? views[last].departure!.time : null;
    const tail = due != null ? `, due to leave ${hm(due)}` : "";
    return P("at-station", last, nxt, act, expectedAt(views[nxt]), 0, delay,
      seen ? `At ${lp.name} since ${hm(act)}${tail} (${late}).` : `At ${where}${tail}.`);
  }

  // Judge progress against what was expected when it left, not against estimates already pushed back by the wait
  const nv = views[nxt];
  const fe = firstEvent(nv.point);
  const expected = fe.forecast ?? fe.estimate ?? plannedArr.get(nxt) ?? expectedAt(nv);
  const np = pts[nxt];
  const frac = sectionFraction(act, expected, now, cfg.holdFraction);
  if (expected != null && now > expected + cfg.overdueAfter) {
    const over = roundMin((now - expected) / 1000);
    return P("overdue", last, nxt, act, expected, cfg.holdFraction, delay,
      `${verb} ${where}. No report at ${np.name} yet, ${over} min after expected. ` +
        (feed === "none" ? NO_FEED : "It may be held at a signal, or the report is late."));
  }
  const expTxt = expected != null ? `, expected about ${hm(expected)}` : "";
  return P("running", last, nxt, act, expected, frac, delay, `${verb} ${where}${seen ? ` (${late})` : ""}. Next: ${np.name}${expTxt}.`);
}

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
