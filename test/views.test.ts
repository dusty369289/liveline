// What a time looks like on the route: which circle it gets, when it says "On time", and the lateness words and colours.
import { describe, expect, it } from "vitest";
import { type PointView, roundMin, type Shown } from "../src/core/engine";
import { emptyTimes, type Point } from "../src/core/models";
import { markOf, type TimeKind } from "../src/ui/components/marks";
import { delayClass, lateness } from "../src/ui/format";
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
