// What the Train view shows: stopped at a station, running, crawling with no report, arrived, and the two times
// along the bottom (left the last station, due at the next). From the simulator's 09:00 Paddington to Oxford.
import { describe, expect, it } from "vitest";
import { build } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
import { sceneOf } from "../src/core/scene";
import { isoLocal } from "../src/core/time";
import { simulator } from "./support";

const DAY = Date.parse("2026-11-07T00:00:00Z");
const at = (hhmm: string) => DAY + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000;

// One simulator, its clock moved by each call: the searches below look at a few hundred moments, and a new
// simulator for each (a new timetable before support.ts shared one) took 7 s of this file's 8
let clock = 0;
const sim = simulator(() => clock);

/** The first train from Paddington to Oxford from 09:00, as the train page would see it at `now`. */
function timelineAt(now: number) {
  clock = now;
  const from = at("09:00");
  const board = parseBoard(sim.getSync("/gb-nr/location", { code: "PAD", timeFrom: isoLocal(from), timeWindow: "60", filterTo: "OXF" }).body,
    { fallbackName: "Paddington", timeFrom: from, timeTo: from + 3_600_000, today: () => now });
  const uid = board.rows[0].uniqueId;
  return build(parseService(sim.getSync("/gb-nr/service", { uniqueIdentity: uid }).body, () => now), now);
}

/** The first moment in [from, to), every 15 s (stops can be short), when the train is in `state`. */
function firstMoment(state: string, from: string, to: string): number {
  for (let t = at(from); t < at(to); t += 15_000) if (timelineAt(t).position.state === state) return t;
  throw new Error(`never ${state} between ${from} and ${to}`);
}

describe("before it leaves", () => {
  const s = sceneOf(timelineAt(at("08:50")));
  it("stands at the first station, saying when it leaves and when it's due at the next", () => {
    expect(s.phase).toBe("stopped");
    expect(s.station?.name).toBe("London Paddington");
    expect(s.left?.label).toMatch(/^Leaves London Paddington/);
    expect(s.left?.shown?.time).toBe(at("09:00"));
    expect(s.right?.label).toBe("Due at Slough");
  });
});

describe("between stations", () => {
  const t = firstMoment("running", "09:01", "10:00");
  const s = sceneOf(timelineAt(t));
  it("runs, with the station it left on the left and the next on the right", () => {
    expect(s.phase).toBe("running");
    expect(s.station).toBeNull();
    expect(s.left?.label).toBe("Left London Paddington");
    expect(s.left?.shown?.source).toBe("actual");
    expect(s.right?.label).toBe("Due at Slough");
    expect(s.right?.shown?.time).toBeGreaterThan(t);
  });

  it("skips passing points: both ends are stations it calls at", () => {
    const names = [s.left?.label, s.right?.label].join(" ");
    expect(names).not.toMatch(/Royal Oak|Westbourne|Iver|Langley/);
  });

  it("says how far along it is, from 0 to 1", () => {
    expect(s.progress).toBeGreaterThanOrEqual(0);
    expect(s.progress).toBeLessThanOrEqual(1);
  });
});

describe("at a station on the way", () => {
  const t = firstMoment("at-station", "09:01", "10:30");
  const s = sceneOf(timelineAt(t));
  it("stops there, with its platform, saying when it leaves", () => {
    expect(s.phase).toBe("stopped");
    expect(s.station?.name).toBeTruthy();
    expect(s.left?.label).toMatch(new RegExp(`^Leaves ${s.station!.name}`));
    expect(s.right?.label).toMatch(/^Due at /);
  });
});

describe("at the end", () => {
  const s = sceneOf(timelineAt(at("11:30")));
  it("has arrived: stopped at the last station, nothing due", () => {
    expect(s.phase).toBe("arrived");
    expect(s.station?.name).toBe("Oxford");
    expect(s.left?.label).toBe("Arrived at Oxford");
    expect(s.right).toBeNull();
  });
});

it("crawls while a report is overdue, rather than racing on", () => {
  const tl = timelineAt(firstMoment("running", "09:01", "10:00"));
  const overdue = { ...tl, position: { ...tl.position, state: "overdue" as const } };
  expect(sceneOf(overdue).phase).toBe("crawling");
});

it("names a station near the train for its sky", () => {
  expect(sceneOf(timelineAt(at("08:50"))).near).toBe("PAD");
});
