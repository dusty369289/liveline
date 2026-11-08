// The engine's rules, each by name, so a change to one fails a test that says which (the golden answers in
// test/parity.test.ts only say that something changed).
import { describe, expect, it } from "vitest";
import { build, DEFAULT_ENGINE, type EngineConfig, sectionFraction } from "../src/core/engine";
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

  // The cut-off runs from the latest time it's expected at its end, never from the booked arrival alone
  const late = (forecast?: string): FakeLocation[] => {
    const locs = route({ gbtt: "10:40", wtt: "10:40", forecast });
    locs[0].dep!.actual = "10:40";
    locs[1].arr!.actual = "10:59";
    locs[1].dep!.actual = "11:00"; // 39 min late, still reporting
    return locs;
  };

  it("a train 39 min late and still reporting is followed past booked + 30 min, with RTT's forecast", () => {
    const now = clock(11, 15);
    const tl = timeline(late("11:19"), now);
    expect(tl.position.state).toBe("running");
    expect(pollAfter(tl, now, 30)).not.toBeNull();
  });

  it("a train 39 min late and still reporting is followed past booked + 30 min, with no forecast", () => {
    const now = clock(11, 15);
    const tl = timeline(late(), now);
    expect(tl.position.state).toBe("running");
    expect(pollAfter(tl, now, 30)).not.toBeNull();
  });

  it("that late train is given up on 30 min after the last report plus the booked running time", () => {
    // left Beta 11:00, booked 19 min to Omega: expected 11:19, so given up after 11:49
    expect(timeline(late(), clock(11, 49)).position.state).not.toBe("unreported");
    const now = clock(11, 50);
    const tl = timeline(late(), now);
    expect(tl.position.state).toBe("unreported");
    expect(pollAfter(tl, now, 30)).toBeNull();
  });

  it("a short journey not yet reported is followed while RTT forecasts it late", () => {
    const locs: FakeLocation[] = [
      { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", forecast: "10:40" } },
      { name: "Omega", crs: "OOO", arr: { gbtt: "10:05", wtt: "10:05", forecast: "10:45" } },
    ];
    const now = clock(10, 36);
    const tl = timeline(locs, now);
    expect(tl.position.state).not.toBe("no-data");
    expect(pollAfter(tl, now, 30)).not.toBeNull();
    expect(timeline(locs, clock(11, 16)).position.state).toBe("no-data");
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

// Each rule runs with the defaults and with a different EngineConfig, so the rule follows its setting
const OTHER: EngineConfig = { recoveryShare: 0.5, minDwell: 60_000, holdFraction: 0.8, overdueAfter: 60_000, giveUpAfter: 10 * M };
const at = (locs: FakeLocation[], now: number, cfg: EngineConfig) => build(parseService(fakeService(locs), () => now), now, cfg);

for (const cfg of [DEFAULT_ENGINE, OTHER]) {
  describe(`engine rules (recoveryShare ${cfg.recoveryShare}, hold ${cfg.holdFraction}, overdue ${cfg.overdueAfter / 1000} s)`, () => {
    it("a late train wins back recoveryShare of the section's allowance, no more", () => {
      const allowance = 240;
      const tl = at([
        { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", actual: "10:10" }, allowance },
        { name: "Junction", pass: { wtt: "10:20" } },
        { name: "Omega", crs: "OOO", arr: { gbtt: "10:40", wtt: "10:40" } },
      ], clock(10, 11), cfg);
      const run = 20 * 60 - allowance * cfg.recoveryShare; // seconds: booked run less what it can win back
      expect(tl.points[1].oursArrival).toBe(clock(10, 10) + run * 1000);
      expect(tl.points[1].passing?.source).toBe("est");
    });

    it("never runs ahead of the working timetable, however much allowance there is", () => {
      const tl = at([
        { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", actual: "10:01" }, allowance: 600 },
        { name: "Junction", pass: { wtt: "10:20" } },
        { name: "Omega", crs: "OOO", arr: { gbtt: "10:40", wtt: "10:40" } },
      ], clock(10, 2), cfg);
      expect(tl.points[1].oursArrival).toBe(clock(10, 20));
    });

    it("never leaves an advertised stop before its booked time, early or late", () => {
      for (const actual of ["09:59", "10:03"]) {
        const tl = at([
          { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", actual } },
          { name: "Beta", crs: "BBB", arr: { gbtt: "10:10", wtt: "10:10" }, dep: { gbtt: "10:15", wtt: "10:15" } },
          { name: "Omega", crs: "OOO", arr: { gbtt: "10:40", wtt: "10:40" } },
        ], clock(10, 4), cfg);
        expect(tl.points[1].oursDeparture, `left Alpha ${actual}`).toBe(clock(10, 15));
      }
    });

    it("a late train keeps at least minDwell at a stop", () => {
      const tl = at([
        { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", actual: "10:20" } },
        { name: "Beta", crs: "BBB", arr: { gbtt: "10:10", wtt: "10:10" }, dep: { gbtt: "10:15", wtt: "10:15" } },
        { name: "Omega", crs: "OOO", arr: { gbtt: "10:40", wtt: "10:40" } },
      ], clock(10, 21), cfg);
      expect(tl.points[1].oursDeparture! - tl.points[1].oursArrival!).toBe(cfg.minDwell);
    });

    const section: FakeLocation[] = [
      { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", actual: "10:00" } },
      { name: "Junction", pass: { wtt: "10:10" } },
      { name: "Omega", crs: "OOO", arr: { gbtt: "10:40", wtt: "10:40" } },
    ];
    const due = clock(10, 10);

    it(`holds at ${cfg.holdFraction} of a section until the next point is reported`, () => {
      const tl = at(section, due + 30_000, cfg);
      expect(tl.position.state).toBe("running");
      expect(tl.position.fraction).toBe(cfg.holdFraction);
      expect(at(section, clock(10, 5), cfg).position.fraction).toBeCloseTo(Math.min(0.5, cfg.holdFraction));
    });

    it(`is overdue only after expected + ${cfg.overdueAfter / 1000} s`, () => {
      expect(at(section, due + cfg.overdueAfter, cfg).position.state).toBe("running");
      const late = at(section, due + cfg.overdueAfter + 1000, cfg).position;
      expect(late.state).toBe("overdue");
      expect(late.fraction).toBe(cfg.holdFraction);
      expect(late.headline).toMatch(/No report at Junction yet/);
    });
  });
}

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
