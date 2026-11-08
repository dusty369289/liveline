// The engine's rules, each by name, so a change to one fails a test that says which (the golden answers in
// test/parity.test.ts only say that something changed).
import { describe, expect, it } from "vitest";
import { build, DEFAULT_ENGINE, sectionFraction } from "../src/core/engine";
import { parseService } from "../src/core/parse";
import { pollAfter } from "../src/core/poll";
import { fromLondon } from "../src/core/time";
import { fakeService, type FakeLocation } from "./support";

const M = 60_000;
const clock = (h: number, m: number, s = 0) => fromLondon(2026, 11, 7, h, m) + s * 1000;
const timeline = (locs: FakeLocation[], now: number) => build(parseService(fakeService(locs), () => now), now);

describe("the headline's lateness is the public one, as on the row", () => {
  it("an arrival 6 min after the public time says 6 min late, though 7 after the working one", () => {
    const tl = timeline([
      { name: "Alpha", crs: "AAA", dep: { gbtt: "15:30", wtt: "15:30", actual: "15:30" } },
      { name: "Omega", crs: "OOO", arr: { gbtt: "15:44", wtt: "15:43:00", actual: "15:50:15" } },
    ], clock(15, 52));
    expect(tl.position.state).toBe("arrived");
    expect(tl.position.headline).toContain("6 min late");
    expect(tl.position.delayMin).toBe(7); // the engine still works on the working timetable
  });

  it("leaving 45 s after the public time is on time, though 75 s after the working one", () => {
    const tl = timeline([
      { name: "Alpha", crs: "AAA", dep: { gbtt: "15:27", wtt: "15:26:30", actual: "15:27:45" } },
      { name: "Omega", crs: "OOO", arr: { gbtt: "15:40", wtt: "15:40" } },
    ], clock(15, 29));
    expect(tl.position.state).toBe("running");
    expect(tl.position.headline).toContain("(on time)");
    expect(tl.position.delayMin).toBe(1);
  });

  it("a passing point has no public time, so its working time is used", () => {
    const tl = timeline([
      { name: "Alpha", crs: "AAA", dep: { gbtt: "15:00", wtt: "15:00", actual: "15:00" } },
      { name: "Junction", pass: { wtt: "15:05:30", actual: "15:08:00" } },
      { name: "Omega", crs: "OOO", arr: { gbtt: "15:40", wtt: "15:40" } },
    ], clock(15, 9));
    expect(tl.position.headline).toContain("(2 min late)");
  });
});

describe(`giving up ${DEFAULT_ENGINE.giveUpAfter / M} min after the booked arrival`, () => {
  const route = (final: FakeLocation["arr"]): FakeLocation[] => [
    { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00" } },
    { name: "Beta", crs: "BBB", arr: { gbtt: "10:20", wtt: "10:20" }, dep: { gbtt: "10:21", wtt: "10:21" } },
    { name: "Omega", crs: "OOO", arr: final },
  ];

  it("a train never reported, 3 h after it was due in, shows the timetable and stops asking", () => {
    const now = clock(13, 40);
    const tl = timeline(route({ gbtt: "10:40", wtt: "10:40" }), now);
    expect(tl.position.state).toBe("no-data");
    expect(tl.position.headline).toMatch(/times shown are the timetable/);
    expect(pollAfter(tl, now, 30)).toBeNull();
  });

  it("a train never reported still polls before the cut-off", () => {
    const now = clock(11, 10); // exactly booked arrival + 30 min: not yet past it
    const tl = timeline(route({ gbtt: "10:40", wtt: "10:40" }), now);
    expect(tl.position.state).toBe("at-origin");
    expect(pollAfter(tl, now, 30)).not.toBeNull();
  });

  it("a train whose arrival was never reported, 1 h after, says so and stops asking", () => {
    const locs = route({ gbtt: "10:40", wtt: "10:40" });
    locs[0].dep!.actual = "10:01";
    locs[1].arr!.actual = "10:22";
    locs[1].dep!.actual = "10:23";
    const now = clock(11, 40);
    const tl = timeline(locs, now);
    expect(tl.position.state).toBe("unreported");
    expect(tl.position.fromIndex).toBe(1);
    expect(tl.position.headline).toMatch(/Beta/);
    expect(tl.position.headline).toMatch(/arrival at Omega was not reported/);
    expect(pollAfter(tl, now, 30)).toBeNull();
  });

  it("a point RTT flags as passed without a report counts as passed", () => {
    const locs = route({ gbtt: "10:40", wtt: "10:40" });
    locs[0].dep!.actual = "10:01";
    locs[1].arr!.noReport = true;
    locs[1].dep!.noReport = true;
    const tl = timeline(locs, clock(10, 30));
    expect(tl.position.fromIndex).toBe(1);
    expect(tl.points[1].reported).toBe(true);
    expect(tl.position.headline).toMatch(/Beta \(not reported\)/);
    expect(tl.worst).toBeNull();
  });
});

describe("how far through a section", () => {
  it("is elapsed time over the expected run", () => {
    expect(sectionFraction(0, 10 * M, 0)).toBe(0);
    expect(sectionFraction(0, 10 * M, 5 * M)).toBe(0.5);
    expect(sectionFraction(0, 10 * M, -M)).toBe(0);
  });

  it(`never passes the hold (${DEFAULT_ENGINE.holdFraction}) of an unreported section`, () => {
    expect(sectionFraction(0, 10 * M, 9.5 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(0, 10 * M, 60 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(0, 10 * M, 60 * M, 0.8)).toBe(0.8);
  });

  it("holds when nothing is expected, or expected before it left", () => {
    expect(sectionFraction(0, null, 5 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(10 * M, 10 * M, 11 * M)).toBe(DEFAULT_ENGINE.holdFraction);
    expect(sectionFraction(10 * M, 5 * M, 11 * M, 0.5)).toBe(0.5);
  });
});
