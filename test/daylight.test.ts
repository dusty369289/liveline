// Day, dawn, dusk or night where the train is, from the sun, so the Train view's sky follows the real clock.
import { describe, expect, it } from "vitest";
import { skyAt, sunTimes } from "../src/core/daylight";

const LONDON = { lat: 51.5074, lon: -0.1278 };
const utc = (iso: string) => Date.parse(`${iso}Z`);
const minutes = 60_000;

describe("sunrise and sunset", () => {
  // Published times for London (timeanddate.com), in UTC: within 5 minutes is plenty for a sky colour
  it("midsummer: up at 03:43, down at 20:21", () => {
    const s = sunTimes(utc("2026-06-21T12:00:00"), LONDON.lat, LONDON.lon)!;
    expect(Math.abs(s.rise - utc("2026-06-21T03:43:00"))).toBeLessThan(5 * minutes);
    expect(Math.abs(s.set - utc("2026-06-21T20:21:00"))).toBeLessThan(5 * minutes);
  });

  it("midwinter: up at 08:04, down at 15:53", () => {
    const s = sunTimes(utc("2026-12-21T12:00:00"), LONDON.lat, LONDON.lon)!;
    expect(Math.abs(s.rise - utc("2026-12-21T08:04:00"))).toBeLessThan(5 * minutes);
    expect(Math.abs(s.set - utc("2026-12-21T15:53:00"))).toBeLessThan(5 * minutes);
  });

  it("is later in the far west and north in winter (Penzance, Thurso)", () => {
    const pz = sunTimes(utc("2026-12-21T12:00:00"), 50.12, -5.53)!;
    const th = sunTimes(utc("2026-12-21T12:00:00"), 58.59, -3.52)!;
    expect(pz.rise - utc("2026-12-21T08:04:00")).toBeGreaterThan(10 * minutes); // about 08:18 there
    expect(th.set - th.rise).toBeLessThan(7 * 60 * minutes); // under 7 hours of daylight
  });
});

describe("the sky", () => {
  const at = (iso: string) => skyAt(utc(iso), LONDON.lat, LONDON.lon);
  it("is day at noon and night at midnight, all year", () => {
    for (const d of ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"]) {
      expect(at(`${d}T12:00:00`), d).toBe("day");
      expect(at(`${d}T00:00:00`), d).toBe("night");
    }
  });

  it("is dawn around sunrise and dusk around sunset", () => {
    expect(at("2026-12-21T07:40:00")).toBe("dawn"); // before sunrise, in civil twilight
    expect(at("2026-12-21T08:20:00")).toBe("dawn"); // just after it
    expect(at("2026-12-21T08:50:00")).toBe("day");
    expect(at("2026-12-21T15:40:00")).toBe("dusk");
    expect(at("2026-12-21T16:20:00")).toBe("dusk");
    expect(at("2026-12-21T17:00:00")).toBe("night");
  });

  it("works without a place, using the middle of Great Britain", () => {
    expect(skyAt(utc("2026-06-21T12:00:00"))).toBe("day");
    expect(skyAt(utc("2026-06-21T23:30:00"))).toBe("night");
  });
});
