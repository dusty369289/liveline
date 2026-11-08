// How often a tracked train is re-fetched (core/poll.ts), and that a day of use stays inside the allowance.
import { describe, expect, it } from "vitest";
import { build, type Timeline } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
import { manualMinAge, POLL, pollAfter } from "../src/core/poll";
import { SimTransport, Timetable } from "../src/core/simulator";
import { fromLondon, isoLocal, type Ms } from "../src/core/time";

// One simulated Paddington to Oxford train, seen at any moment. One simulator with a movable clock and one shared
// timetable: building the day's timetable afresh for each of ~90 steps made the end-to-end test take 2.5 to 5.5 s,
// close enough to a time limit to fail on a busy machine.
const t0 = fromLondon(2026, 11, 7, 9, 0);
let simNow = t0;
const sim = new SimTransport(() => simNow, new Timetable());
const pick = (() => {
  const r = sim.getSync("/gb-nr/location", { code: "PAD", timeFrom: isoLocal(t0), timeWindow: "60", filterTo: "OXF" });
  const b = parseBoard(r.body, { fallbackName: "PAD", timeFrom: t0, timeTo: t0 + 3_600_000, today: () => t0 });
  return b.rows[0].uniqueId;
})();
const at = (now: Ms): Timeline => {
  simNow = now;
  return build(parseService(sim.getSync("/gb-nr/service", { uniqueIdentity: pick }).body, () => now), now);
};
const dep = (() => {
  const tl = at(t0);
  return tl.points.find((v) => v.point.crs === "PAD")!.departure!.booked!;
})();
const arr = (() => {
  const tl = at(t0);
  return tl.points.find((v) => v.point.crs === "OXF")!.arrival!.booked!;
})();

/** The same train as RTT knew it a minute before it was due off (nothing reported), seen at `now`, as `mode`. */
const unreported = (now: Ms, mode = "TRAIN"): Timeline => {
  simNow = dep - 60_000;
  const body = structuredClone(sim.getSync("/gb-nr/service", { uniqueIdentity: pick }).body) as
    { service: { scheduleMetadata: { modeType: string } } };
  body.service.scheduleMetadata.modeType = mode;
  return build(parseService(body, () => now), now);
};

describe("manual refresh", () => {
  it("is 4x faster than the automatic polls while the hour has plenty left", () => {
    expect(manualMinAge(100, 10)).toBe(15);
    expect(manualMinAge(31, 10)).toBe(15);
  });
  it("slows to once a minute when the hour runs low", () => {
    expect(manualMinAge(30, 10)).toBe(60);
    expect(manualMinAge(11, 10)).toBe(60);
  });
  it("never touches the calls kept for searches", () => {
    expect(manualMinAge(10, 10)).toBeNull();
    expect(manualMinAge(0, 10)).toBeNull();
  });
  it("tapping as fast as allowed from a full hour still leaves the search reserve", () => {
    let left = 100;
    let t = 0;
    while (t < 3600) {
      const m = manualMinAge(left, 10);
      if (m == null) break;
      left -= 1;
      t += m;
    }
    expect(left).toBe(10);
  });
});

describe("polling a train", () => {
  it("before it leaves, checks rarely and wakes up shortly before it's due", () => {
    const tl = at(dep - 40 * 60_000);
    expect(tl.position.state).toBe("not-started");
    expect(pollAfter(tl, dep - 40 * 60_000, 30)).toBe(POLL.notStartedMax);
    const soon = at(dep - 3 * 60_000);
    const s = pollAfter(soon, dep - 3 * 60_000, 30)!;
    expect(s).toBeGreaterThanOrEqual(60);
    expect(s).toBeLessThanOrEqual(130); // about a minute before it's due
  });

  it("while it runs, waits for the next report rather than polling on a beat", () => {
    for (let m = 5; m < (arr - dep) / 60_000 - 5; m += 7) {
      const now = dep + m * 60_000;
      const tl = at(now);
      const s = pollAfter(tl, now, 30);
      expect(s, `${m} min in (${tl.position.state})`).not.toBeNull();
      expect(s!).toBeGreaterThanOrEqual(POLL.min);
      expect(s!).toBeLessThanOrEqual(Math.max(POLL.max, POLL.farAway));
    }
  });

  it("never polls faster than the allowance allows", () => {
    const now = dep + 10 * 60_000;
    expect(pollAfter(at(now), now, 400)).toBe(400);
  });

  it("is slower while your stop is still far off", () => {
    const now = dep + 2 * 60_000;
    expect(pollAfter(at(now), now, 30, "OXF")).toBeGreaterThanOrEqual(POLL.farAway);
  });

  it("stops only once it has arrived; passing your own stop doesn't stop it", () => {
    const after = arr + 10 * 60_000;
    expect(pollAfter(at(after), after, 30)).toBeNull();
    // five minutes before Oxford it has long passed Reading: you may have got off there, and still want to watch
    const now = arr - 5 * 60_000;
    const tl = at(now);
    expect(tl.points.find((v) => v.point.crs === "RDG")!.reported).toBe(true);
    expect(pollAfter(tl, now, 30, "PAD")).not.toBeNull();
  });

  it("a train with nothing reported 10 minutes after it was due off is checked every 3 minutes, not every minute", () => {
    const soon = dep + 5 * 60_000;
    expect(unreported(soon).position.state).toBe("at-origin");
    expect(pollAfter(unreported(soon), soon, 30)).toBe(POLL.overdue); // just late: worth watching closely
    const now = dep + 15 * 60_000;
    expect(pollAfter(unreported(now), now, 30)).toBeGreaterThanOrEqual(POLL.notStartedMax);
  });

  it("a replacement bus isn't reported, so it's checked every 3 minutes and says the times are the timetable", () => {
    const now = dep + 5 * 60_000;
    const bus = unreported(now, "REPLACEMENT_BUS");
    expect(pollAfter(bus, now, 30)).toBeGreaterThanOrEqual(POLL.notStartedMax);
    expect(bus.position.headline).toBe("Buses aren't tracked live: the times shown are the timetable.");
    expect(unreported(now, "SHIP").position.headline).toBe("Ships aren't tracked live: the times shown are the timetable.");
  });

  it("following one train end to end fits the hour, with the search reserve left over", () => {
    let now = dep - 20 * 60_000;
    let calls = 0;
    while (calls < 500) {
      const s = pollAfter(at(now), now, 30, "PAD");
      calls += 1;
      if (s == null) break;
      now += s * 1000;
    }
    const hours = (now - (dep - 20 * 60_000)) / 3_600_000;
    expect(calls / hours).toBeLessThanOrEqual(60); // at most once a minute, so the hour has room for searches
    expect(calls / hours).toBeGreaterThan(30); // and not so slow it goes stale
  });
});
