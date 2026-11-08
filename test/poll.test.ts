// How often a tracked train is re-fetched (core/poll.ts), and that a day of use stays inside the allowance.
import { describe, expect, it } from "vitest";
import { build, type Timeline } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
import { manualMinAge, nextWait, POLL, pollAfter } from "../src/core/poll";
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

  it("a train days away waits half an hour; within two hours it's back to every 3 minutes at most", () => {
    const tl = at(dep - 40 * 60_000);
    expect(tl.position.state).toBe("not-started");
    expect(pollAfter(tl, dep - 48 * 3_600_000, 30)).toBeGreaterThanOrEqual(30 * 60);
    expect(pollAfter(tl, dep - 48 * 3_600_000, 30)).toBe(POLL.notStartedFar);
    expect(pollAfter(tl, dep - 60 * 60_000, 30)).toBeLessThanOrEqual(180);
    // between the two it wakes in time to be on the 3-minute beat two hours before
    expect(pollAfter(tl, dep - (POLL.wakeBefore + 10 * 60) * 1000, 30)).toBe(10 * 60);
    expect(pollAfter(tl, dep - (POLL.wakeBefore + 60) * 1000, 30)).toBe(POLL.notStartedMax);
  });

  it("while it runs, waits for the next report rather than polling on a beat", () => {
    const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
    for (let m = 5; m < (arr - dep) / 60_000 - 5; m += 7) {
      const now = dep + m * 60_000;
      const tl = at(now);
      const p = tl.position;
      const due = p.state === "at-station" ? tl.points[p.fromIndex!].departure!.time! : p.expected;
      const want = p.state === "overdue" || p.state === "at-origin" ? POLL.overdue
        : Math.round(clamp((due! - now) / 1000 + POLL.afterDue, POLL.running, POLL.max));
      expect(pollAfter(tl, now, 30), `${m} min in (${p.state})`).toBe(want);
    }
  });

  it("asks just after the next report is due: 30 s off waits a minute, 90 s off waits 110 s", () => {
    let now = dep + 2 * 60_000;
    while (at(now).position.state !== "running" && now < arr) now += 60_000;
    const tl = at(now);
    expect(tl.position.state).toBe("running");
    const due = tl.position.expected!;
    expect(pollAfter(tl, due - 30_000, 30)).toBe(POLL.running);
    expect(pollAfter(tl, due - 90_000, 30)).toBe(90 + POLL.afterDue);
  });

  it("the train page keeps a half-hour wait: a train 3 hours off costs one call in 25 minutes", () => {
    // live-train.ts schedules nextWait(refreshAfter, failures) after every answer
    const start = dep - 3 * 3_600_000;
    let now = start;
    let calls = 0;
    while (now < start + 25 * 60_000) {
      calls += 1;
      now += nextWait(pollAfter(at(now), now, 30, "PAD")!, 0) * 1000;
    }
    expect(calls).toBe(1);
  });

  it("after failures the wait grows to at most 5 minutes, and never shrinks", () => {
    expect(nextWait(60, 0)).toBe(60);
    expect(nextWait(60, 2)).toBe(180);
    expect(nextWait(200, 1)).toBe(POLL.retryMax);
    expect(nextWait(POLL.notStartedFar, 0)).toBe(POLL.notStartedFar);
    expect(nextWait(POLL.notStartedFar, 3)).toBe(POLL.notStartedFar);
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
