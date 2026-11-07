// How often a tracked train is re-fetched (core/poll.ts), and that a day of use stays inside the allowance.
import { describe, expect, it } from "vitest";
import { build, type Timeline } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
import { POLL, pollAfter } from "../src/core/poll";
import { SimTransport } from "../src/core/simulator";
import { fromLondon, isoLocal, type Ms } from "../src/core/time";

// one simulated Paddington to Oxford train, seen at any moment
const t0 = fromLondon(2026, 11, 7, 9, 0);
const pick = (() => {
  const sim = new SimTransport(() => t0);
  const r = sim.getSync("/gb-nr/location", { code: "PAD", timeFrom: isoLocal(t0), timeWindow: "60", filterTo: "OXF" });
  const b = parseBoard(r.body, { fallbackName: "PAD", timeFrom: t0, timeTo: t0 + 3_600_000, today: () => t0 });
  return b.rows[0].uniqueId;
})();
const at = (now: Ms): Timeline => {
  const sim = new SimTransport(() => now);
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

  it("stops once it has arrived, or once you've got off", () => {
    const after = arr + 10 * 60_000;
    expect(pollAfter(at(after), after, 30)).toBeNull();
    const tl = at(arr - 5 * 60_000);
    const mid = tl.points.filter((v) => v.point.kind === "call" && v.point.crs && v.reported).at(-1);
    if (mid?.point.crs && mid.point.crs !== "PAD") expect(pollAfter(tl, arr - 5 * 60_000, 30, "", mid.point.crs)).toBeNull();
  });

  it("following one train end to end fits the hour, with the search reserve left over", () => {
    let now = dep - 20 * 60_000;
    let calls = 0;
    while (calls < 500) {
      const s = pollAfter(at(now), now, 30, "PAD", "OXF");
      calls += 1;
      if (s == null) break;
      now += s * 1000;
    }
    const hours = (now - (dep - 20 * 60_000)) / 3_600_000;
    expect(calls / hours).toBeLessThanOrEqual(60); // at most once a minute, so the hour has room for searches
    expect(calls / hours).toBeGreaterThan(30); // and not so slow it goes stale
  });
});
