// The train never runs past a point not yet reported, but a report further on (past a point that didn't report, with
// nothing from RTT about it) moves it on at once (owner, 2026-11-08).
import { describe, expect, it } from "vitest";
import { build, DEFAULT_ENGINE, sectionFraction } from "../src/core/engine";
import { parseService } from "../src/core/parse";
import { fromLondon } from "../src/core/time";
import { fakeService, type FakeLocation } from "./support";

const clock = (h: number, m: number) => fromLondon(2026, 11, 7, h, m);
const timeline = (locs: FakeLocation[], now: number) => build(parseService(fakeService(locs), () => now), now);

const line = (): FakeLocation[] => [
  { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00", actual: "10:00" } },
  { name: "Junction", pass: { wtt: "10:05" } },
  { name: "Gamma", pass: { wtt: "10:10" } },
  { name: "Omega", crs: "OOO", arr: { gbtt: "10:20", wtt: "10:20" } },
];

describe("a missing report", () => {
  it("holds short of the next point while it isn't reported, however long past due", () => {
    const tl = timeline(line(), clock(10, 9));
    expect(tl.position.fromIndex).toBe(0);
    expect(tl.position.toIndex).toBe(1);
    expect(sectionFraction(tl.position.since!, tl.position.expected!, clock(10, 9))).toBe(DEFAULT_ENGINE.holdFraction);
  });

  it("a report further on moves it past a point that never reported", () => {
    const locs = line();
    locs[2].pass!.actual = "10:10";
    const tl = timeline(locs, clock(10, 11));
    expect(tl.position.fromIndex).toBe(2);
    expect(tl.position.toIndex).toBe(3);
  });
});
