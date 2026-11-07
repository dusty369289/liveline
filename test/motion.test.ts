// The Train view's motion: it stops exactly at the platform, accelerates away when it's reported gone, crawls while
// a report is overdue, and never runs backwards. Stepped like animation frames (60 a second).
import { describe, expect, it } from "vitest";
import { MOTION, Motion } from "../src/core/motion";

const FRAME = 1 / 60;
function run(m: Motion, secs: number, each?: (m: Motion) => void): void {
  for (let t = 0; t < secs; t += FRAME) {
    m.step(FRAME);
    each?.(m);
  }
}

describe("opening the page", () => {
  it("at a station: stands still at the platform", () => {
    const m = new Motion("stop");
    expect(m.v).toBe(0);
    expect(m.platformAhead()).toBe(0);
  });

  it("between stations: already at speed, no platform", () => {
    const m = new Motion("run");
    expect(m.v).toBe(MOTION.cruise);
    expect(m.platformAhead()).toBeNull();
  });
});

describe("arriving", () => {
  it("brings a platform in from ahead and stops exactly at it, slowing all the way", () => {
    const m = new Motion("run");
    m.set("stop");
    const ahead = m.platformAhead()!;
    expect(ahead).toBeGreaterThanOrEqual(MOTION.arriveFrom); // enters from off the screen
    let last = m.v;
    run(m, 20, (s) => {
      expect(s.v).toBeLessThanOrEqual(last + 1e-9);
      expect(s.platformAhead()!).toBeGreaterThanOrEqual(0); // never overshoots
      last = s.v;
    });
    expect(m.v).toBe(0);
    expect(m.platformAhead()).toBe(0);
  });

  it("takes a few seconds, not an age, even from a crawl", () => {
    const m = new Motion("crawl");
    m.set("stop");
    let t = 0;
    while (m.v > 0 && t < 30) {
      m.step(FRAME);
      t += FRAME;
    }
    expect(t).toBeLessThan(12);
  });
});

describe("leaving", () => {
  it("accelerates away from the platform up to speed, leaving it behind", () => {
    const m = new Motion("stop");
    m.set("run");
    run(m, 1);
    expect(m.v).toBeGreaterThan(0);
    expect(m.v).toBeLessThan(MOTION.cruise); // still picking up speed after a second
    expect(m.platformAhead()!).toBeLessThan(0); // the platform slides back past the train
    run(m, 20);
    expect(m.v).toBe(MOTION.cruise);
  });

  it("forgets the platform once it's far behind", () => {
    const m = new Motion("stop");
    m.set("run");
    run(m, 60);
    expect(m.platformAhead()).toBeNull();
  });
});

describe("waiting for a report", () => {
  it("slows to a crawl, and picks up again when the report comes", () => {
    const m = new Motion("run");
    m.set("crawl");
    run(m, 10);
    expect(m.v).toBe(MOTION.crawl);
    m.set("run");
    run(m, 20);
    expect(m.v).toBe(MOTION.cruise);
  });
});

it("only ever moves forward", () => {
  const m = new Motion("run");
  let x = m.x;
  for (const mode of ["stop", "run", "crawl", "stop", "stop", "run"] as const) {
    m.set(mode);
    run(m, 5, (s) => {
      expect(s.x).toBeGreaterThanOrEqual(x);
      x = s.x;
    });
  }
});

it("a long pause between frames (a background tab) doesn't jump past the platform", () => {
  const m = new Motion("run");
  m.set("stop");
  m.step(30);
  expect(m.platformAhead()!).toBeGreaterThanOrEqual(0);
});
