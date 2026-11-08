// What a time looks like on the route: which circle it gets, when it says "On time", and the lateness words and
// colours; and where the marker sits between two rows.
import { describe, expect, it } from "vitest";
import { type PointView, roundMin, type Shown } from "../src/core/engine";
import { emptyTimes, type Point } from "../src/core/models";
import { markOf, type TimeKind } from "../src/ui/components/marks";
import { delayClass, lateness } from "../src/ui/format";
import { clampBetween, MAX_CLEAR, MIN_AWAY, PASS_AWAY } from "../src/ui/route-place";
import { pointTimes } from "../src/ui/views/live-region";

const T = Date.UTC(2026, 10, 7, 10, 0);

function point(kind: Point["kind"]): Point {
  return {
    name: "Twyford", crs: "TWY", tiploc: "TWYFORD", kind, display: kind === "pass" ? "PASS" : "CALL",
    arrival: emptyTimes(), departure: emptyTimes(), passing: emptyTimes(), platform: null, platformConfirmed: false,
    platformChanged: false, status: null, public: kind === "call", requestStop: false, interpolated: false,
    allowances: { engineering: 0, pathing: 0, performance: 0 }, line: null, path: null,
  };
}

const shown = (source: TimeKind, lateSecs: number): Shown =>
  ({ time: T + lateSecs * 1000, source, booked: T, delayMin: roundMin(lateSecs) });

function view(kind: Point["kind"], s: Shown): PointView {
  return {
    index: 0, point: point(kind), arrival: null, departure: kind === "call" ? s : null, passing: kind === "pass" ? s : null,
    reported: s.source === "actual", oursArrival: null, oursDeparture: null,
  };
}

const markIn = (h: string) =>
  h.includes('fill="currentColor"') ? "filled" : h.includes("stroke-dasharray") ? "dashed" : h.includes("<circle") ? "ring" : "none";

describe("the circle before a time", () => {
  const want: Record<TimeKind, string> = { actual: "filled", forecast: "ring", "rtt-estimate": "ring", est: "dashed", booked: "none" };
  for (const [source, circle] of Object.entries(want) as Array<[TimeKind, string]>) {
    it(`${source} gets ${circle}`, () => {
      expect(markIn(pointTimes(view("call", shown(source, 180))).value)).toBe(circle);
    });
  }

  it("our own estimate never gets Realtime Trains' forecast ring", () => {
    expect(markOf("est")).toBe("est");
    for (const late of [0, 180]) expect(markIn(pointTimes(view("call", shown("est", late))).value)).toBe("dashed");
  });
});

describe("On time", () => {
  for (const source of ["forecast", "rtt-estimate", "est"] as const) {
    it(`a ${source} that matches booked says On time`, () => {
      const h = pointTimes(view("call", shown(source, 0))).value;
      expect(h).toContain("On time");
    });
  }

  it("a reported time shows the time itself, even when on time", () => {
    expect(pointTimes(view("call", shown("actual", 0))).value).not.toContain("On time");
  });

  it("a junction on time shows only its circle", () => {
    const h = pointTimes(view("pass", shown("rtt-estimate", 0))).value;
    expect(h).not.toContain("route__ontime");
    expect(markIn(h)).toBe("ring");
  });
});

describe("lateness words and colour", () => {
  const cases: Array<[number, string, string]> = [
    [-61, "1 min early", "is-early"],
    [-59, "On time", "is-ontime"],
    [0, "On time", "is-ontime"],
    [119, "1 min late", "is-ontime"],
    [300, "5 min late", "is-very-late"],
  ];
  for (const [secs, words, cls] of cases) {
    it(`${secs} s is "${words}" (${cls})`, () => {
      const s = shown("actual", secs);
      expect(lateness(s)).toBe(words);
      expect(delayClass(s)).toBe(cls);
    });
  }

  it("a time that's only booked has nothing to compare", () => {
    expect(lateness(shown("booked", 0))).toBe("");
  });
});

describe("the marker between two rows", () => {
  it("keeps MIN_AWAY clear of both points on a long section", () => {
    expect(MIN_AWAY).toBe(26);
    expect(clampBetween(0, 200, 0)).toBe(26);
    expect(clampBetween(0, 200, 0.05)).toBe(26);
    expect(clampBetween(0, 200, 0.5)).toBe(100);
    expect(clampBetween(0, 200, 1)).toBe(174);
    expect(clampBetween(100, 300, 0.25)).toBe(150);
  });

  // Owner, 2026-11-08: between passing points the train sat still until the next report. Their rows are ~37 px apart,
  // and keeping 26 px clear of both (or half the gap) pinned it to the middle for the whole section.
  it("moves on a short section: the clear space never takes more than MAX_CLEAR of it", () => {
    for (const [gap, ends] of [[37, [PASS_AWAY, PASS_AWAY]], [40, [MIN_AWAY, PASS_AWAY]], [40, [MIN_AWAY, MIN_AWAY]]] as const) {
      const ys = [0, 0.25, 0.5, 0.75, 1].map((f) => clampBetween(0, gap, f, ends[0], ends[1]));
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]); // never backwards
      expect(ys[4] - ys[0]).toBeGreaterThanOrEqual(gap * (1 - MAX_CLEAR) - 1e-9); // at least a third to move along
    }
  });

  it("keeps less clear of a passing point (a tick) than of a station (a ring)", () => {
    expect(PASS_AWAY).toBeLessThan(MIN_AWAY);
    expect(clampBetween(0, 200, 0, PASS_AWAY, PASS_AWAY)).toBe(PASS_AWAY);
    expect(clampBetween(0, 200, 0, MIN_AWAY, PASS_AWAY)).toBe(MIN_AWAY);
    expect(clampBetween(0, 200, 1, MIN_AWAY, PASS_AWAY)).toBe(200 - PASS_AWAY);
  });

  it("takes another distance", () => {
    expect(clampBetween(0, 200, 0, 10)).toBe(10);
  });
});
