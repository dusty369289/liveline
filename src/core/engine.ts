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
}

export const DEFAULT_ENGINE: EngineConfig = {
  recoveryShare: 0.75,
  minDwell: 30_000,
  holdFraction: 0.95,
  overdueAfter: 120_000,
};

export type State = "not-started" | "at-origin" | "at-station" | "running" | "overdue" | "arrived" | "cancelled" | "no-data";

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

/** `feed` is RTT's own state (models.feedOf): with no live data, a missing report is the feed, not the train. */
export function build(service: Service, now: Ms, cfg: EngineConfig = DEFAULT_ENGINE, feed: Feed = "ok"): Timeline {
  const pts = service.points;
  const usable = pts.map((p, i) => (isCancelled(p) ? -1 : i)).filter((i) => i >= 0);

  let last: number | null = null; // the last point with any actual
  for (const i of usable) if (actualOf(pts[i])[0] != null) last = i;

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
        const [act, ev] = actualOf(p) as [Ms, Times];
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

  const views: PointView[] = pts.map((p, i) => {
    const reported = last != null && i <= last;
    const oa = oursArr.get(i) ?? null;
    if (p.kind === "pass") {
      return {
        index: i,
        point: p,
        arrival: null,
        departure: null,
        passing: shown(p.passing, oa, floorArr.get(i) ?? now, !reported),
        reported,
        oursArrival: oa,
        oursDeparture: null,
      };
    }
    const od = oursDep.get(i) ?? null;
    return {
      index: i,
      point: p,
      arrival: isEmpty(p.arrival) ? null : shown(p.arrival, oa, floorArr.get(i) ?? now, !reported),
      departure: isEmpty(p.departure) ? null : shown(p.departure, od, floorDep.get(i) ?? now, !reported),
      passing: null,
      reported,
      oursArrival: oa,
      oursDeparture: od,
    };
  });

  return {
    service,
    points: views,
    position: position(service, views, usable, last, now, cfg, plannedArr, feed),
    now,
    worst: worst(pts, usable, last),
  };
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

function position(
  service: Service,
  views: PointView[],
  usable: number[],
  last: number | null,
  now: Ms,
  cfg: EngineConfig,
  plannedArr: Map<number, Ms>,
  feed: Feed,
): Position {
  const pts = service.points;
  const P = (state: State, fromIndex: number | null, toIndex: number | null, since: Ms | null, expected: Ms | null,
    fraction: number, delayMin: number | null, headline: string): Position =>
    ({ state, fromIndex, toIndex, since, expected, fraction, delayMin, headline });
  if (!pts.length) return P("no-data", null, null, null, null, 0, null, "No route data for this train.");
  if (!usable.length) return P("cancelled", null, null, null, null, 0, null, "This train is cancelled.");

  if (last == null) {
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
  const [act, ev] = actualOf(lp) as [Ms, Times];
  const pl = ev ? planned(ev) : null;
  const delay = pl != null ? roundMin((act - pl) / 1000) : null;
  // The words say what the row says: lateness against the public time (working time where there's none). `delay`
  // stays on the working timetable, which is what the estimate runs on.
  const lv = views[last];
  const reportedShown = ev === lp.arrival ? lv.arrival : ev === lp.departure ? lv.departure : lv.passing;
  const late = lateText(reportedShown?.delayMin ?? delay);

  const nxtK = usable.indexOf(last) + 1;
  if (nxtK >= usable.length) {
    return P("arrived", last, null, act, null, 1, delay, `Arrived at ${lp.name} ${hm(act)}, ${late}.`);
  }
  const nxt = usable[nxtK];

  if (lp.kind === "call" && ev === lp.arrival && !isEmpty(lp.departure)) {
    const due = views[last].departure ? views[last].departure!.time : null;
    const tail = due != null ? `, due to leave ${hm(due)}` : "";
    return P("at-station", last, nxt, act, expectedAt(views[nxt]), 0, delay, `At ${lp.name} since ${hm(act)}${tail} (${late}).`);
  }

  // Judge progress against what was expected when it left, not against estimates already pushed back by the wait
  const nv = views[nxt];
  const fe = firstEvent(nv.point);
  const expected = fe.forecast ?? fe.estimate ?? plannedArr.get(nxt) ?? expectedAt(nv);
  const np = pts[nxt];
  const frac = sectionFraction(act, expected, now, cfg.holdFraction);
  const verb = lp.kind === "pass" ? "Passed" : "Left";
  if (expected != null && now > expected + cfg.overdueAfter) {
    const over = roundMin((now - expected) / 1000);
    return P("overdue", last, nxt, act, expected, cfg.holdFraction, delay,
      `${verb} ${lp.name} ${hm(act)}. No report at ${np.name} yet, ${over} min after expected. ` +
        (feed === "none" ? NO_FEED : "It may be held at a signal, or the report is late."));
  }
  const expTxt = expected != null ? `, expected about ${hm(expected)}` : "";
  return P("running", last, nxt, act, expected, frac, delay, `${verb} ${lp.name} ${hm(act)} (${late}). Next: ${np.name}${expTxt}.`);
}

export interface StopSummary {
  name: string;
  index: number;
  shown: Shown | null;
  platform: string | null;
  platformConfirmed: boolean;
  status: "ahead" | "here" | "gone" | "cancelled";
  minutes: number | null; // from now until the train is due there (ahead only)
  callsBetween: number; // stops between the train and this one
}

/** How things stand at one station on this train: where you get on (or off). */
export function stopSummary(tl: Timeline, code: string, boarding = true): StopSummary | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const v = tl.points.find((w) => w.point.kind === "call" && (w.point.crs === c || w.point.tiploc === c));
  if (!v) return null;
  const p = v.point;
  const sh = boarding ? (v.departure ?? v.arrival) : (v.arrival ?? v.departure);
  const pos = tl.position;
  const status = isCancelled(p) ? "cancelled" : pos.state === "at-station" && pos.fromIndex === v.index ? "here" : v.reported ? "gone" : "ahead";
  let minutes: number | null = null;
  let between = 0;
  if (status === "ahead") {
    if (sh && sh.time != null) minutes = Math.max(Math.floor((sh.time - tl.now) / 60_000), 0);
    const start = pos.fromIndex ?? -1;
    between = tl.points.slice(start + 1, v.index).filter((w) => w.point.kind === "call" && !isCancelled(w.point)).length;
  }
  return { name: p.name, index: v.index, shown: sh, platform: p.platform, platformConfirmed: p.platformConfirmed, status, minutes, callsBetween: between };
}
