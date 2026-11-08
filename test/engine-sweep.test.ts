// Properties the engine must keep for every train at every moment, swept over part of a simulated morning at Reading
// (the demo railway: late, early, cancelled and short-terminated trains). One simulator and one shared Timetable, as
// building the day's timetable afresh for each step is slow (test/poll.test.ts).
import { expect, it } from "vitest";
import { build, DEFAULT_ENGINE, type State } from "../src/core/engine";
import { planned } from "../src/core/models";
import { parseBoard, parseService } from "../src/core/parse";
import { POLL, pollAfter } from "../src/core/poll";
import { yourStops } from "../src/core/stops";
import { SimTransport, Timetable } from "../src/core/simulator";
import { fromLondon, isoLocal, type Ms } from "../src/core/time";

const STATES: State[] = ["not-started", "at-origin", "at-station", "running", "overdue", "arrived", "cancelled", "no-data", "unreported"];
const FINISHED: State[] = ["arrived", "cancelled", "no-data", "unreported"];
const t0 = fromLondon(2026, 11, 7, 7, 0);
let simNow: Ms = t0;
const sim = new SimTransport(() => simNow, new Timetable());

it("every train, every 10 minutes from 07:00 to 09:30, keeps the engine's promises", () => {
  const board = parseBoard(sim.getSync("/gb-nr/location", { code: "RDG", timeFrom: isoLocal(t0), timeWindow: "90" }).body,
    { fallbackName: "RDG", timeFrom: t0, timeTo: t0 + 90 * 60_000, today: () => t0 });
  const uids = [...new Set(board.rows.map((r) => r.uniqueId))].slice(0, 6);
  expect(uids.length).toBeGreaterThan(2);
  let checked = 0;
  const seen = new Set<State>();
  for (let now = t0; now <= t0 + 150 * 60_000; now += 10 * 60_000) {
    simNow = now;
    for (const uid of uids) {
      const tl = build(parseService(sim.getSync("/gb-nr/service", { uniqueIdentity: uid }).body, () => now), now);
      const p = tl.position;
      const why = `${uid} at ${isoLocal(now)} (${p.state})`;
      expect(STATES, why).toContain(p.state);
      expect(p.fraction, why).toBeGreaterThanOrEqual(0);
      expect(p.fraction, why).toBeLessThanOrEqual(p.state === "arrived" ? 1 : DEFAULT_ENGINE.holdFraction);
      if (p.fromIndex != null && p.toIndex != null) expect(p.fromIndex, why).toBeLessThan(p.toIndex);
      // passed points are a prefix of the route: nothing after an unreported point counts as passed
      const firstAhead = tl.points.findIndex((v) => !v.reported);
      if (firstAhead >= 0) expect(tl.points.slice(firstAhead).some((v) => v.reported), why).toBe(false);
      for (const v of tl.points) {
        // our estimate never leaves an advertised stop before its booked time
        if (v.point.public && v.oursDeparture != null) expect(v.oursDeparture, `${why} ${v.point.name}`).toBeGreaterThanOrEqual(planned(v.point.departure)!);
        // nothing is shown for an event the train no longer makes
        const sent = tl.service.points[v.index];
        if (sent.display !== "CANCELLED" && sent.departure.cancelled) expect(v.departure, `${why} ${v.point.name}`).toBeNull();
      }
      const poll = pollAfter(tl, now, 30, "RDG");
      if (FINISHED.includes(p.state)) expect(poll, why).toBeNull();
      else expect(poll, why).toBeGreaterThanOrEqual(POLL.min);
      // where it goes on to Paddington, you get off there after getting on
      const [on, off] = yourStops(tl, "RDG", "PAD");
      const onward = on != null && tl.points.some((v) => v.index > on.index && v.point.kind === "call" && v.point.crs === "PAD");
      if (onward) expect(off!.index, why).toBeGreaterThan(on!.index);
      seen.add(p.state);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(40);
  expect([...seen]).toEqual(expect.arrayContaining(["not-started", "running", "arrived"])); // the sweep saw trains in motion
});
