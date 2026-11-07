// How a train is made up: coaches, their letters and facilities when RTT has them, and plain coaches when it doesn't.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formationFor, parseFormations } from "../src/core/formation";

const load = (name: string) => JSON.parse(readFileSync(`test/fixtures/rtt/${name}`, "utf8"));

describe("with Know Your Train data", () => {
  const set = parseFormations(load("spec_service_formation.json"), null);
  const f = formationFor(set, 0);

  it("has every coach, front first, with its letter", () => {
    expect(f.detailed).toBe(true);
    expect(f.coaches.map((c) => c.letter).join("")).toBe("ABCDEFGHJK");
  });

  it("gives each coach its own and its unit's facilities, lowercased, once each", () => {
    expect(f.coaches[0].facilities).toEqual(["toilet", "first", "quiet"]);
    expect(f.coaches[4].facilities).toEqual(["toilet", "bicycle"]);
    expect(f.coaches[5].facilities).toEqual([]); // the second unit has no group facilities
    expect(f.facilities).toEqual(["wifi", "power", "aircon"]); // the whole train
  });

  it("knows where one unit ends and the next begins", () => {
    expect(f.units).toEqual(["800010", "800023"]);
    expect(f.coaches.map((c) => c.unit)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    expect(f.leadingClass).toBe("800");
  });

  it("changes formation where the allocation changes (one unit after Swindon)", () => {
    const after = formationFor(set, 2);
    expect(after.coaches).toHaveLength(5);
    expect(after.detailed).toBe(false); // that allocation has no Know Your Train part
    expect(after.coaches.every((c) => c.letter === null && c.facilities.length === 0)).toBe(true);
    expect(after.units).toEqual(["800010"]);
  });
});

describe("without Know Your Train data (what a Hobbyist key gets)", () => {
  it("counts coaches by unit from the allocation, with no letters or facilities", () => {
    const f = formationFor(parseFormations(load("real_service_C42245_20261107-1526.json"), null), 0);
    expect(f.detailed).toBe(false);
    expect(f.countKnown).toBe(true);
    expect(f.coaches).toHaveLength(9);
    expect(f.units).toEqual(["800317"]);
    expect(f.leadingClass).toBe("800");
  });

  it("leaves out a unit whose number is suppressed, but keeps its coaches", () => {
    const f = formationFor(parseFormations(load("spec_service_reading_paddington.json"), null), 0);
    expect(f.units).toEqual(["387131"]);
    expect(f.coaches).toHaveLength(5); // 4 counted for the first unit, and the total says 5
  });

  it("falls back to the coach count it was given, then to a guess it says is a guess", () => {
    expect(formationFor(parseFormations({ service: {} }, 6), null).coaches).toHaveLength(6);
    const guess = formationFor(parseFormations({ service: {} }, null), null);
    expect(guess.countKnown).toBe(false);
    expect(guess.coaches.length).toBeGreaterThan(0);
  });
});
