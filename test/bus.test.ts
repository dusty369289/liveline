// A bus or ship is never reported, and the page says its times are the timetable: so they must be, at every stop and
// in your stop's summary, rather than our estimate sliding later each minute.
import { describe, expect, it } from "vitest";
import { build, timetableOnly } from "../src/core/engine";
import { parseService } from "../src/core/parse";
import { stopSummary } from "../src/core/stops";
import { fromLondon } from "../src/core/time";
import { fakeService } from "./support";

const clock = (h: number, m: number) => fromLondon(2026, 11, 7, h, m);
const bus = (now: number, mode = "BUS") => {
  const body = fakeService([
    { name: "Alpha", crs: "AAA", dep: { gbtt: "10:00", wtt: "10:00" } },
    { name: "Middle", crs: "MMM", arr: { gbtt: "10:30", wtt: "10:30" }, dep: { gbtt: "10:31", wtt: "10:31" } },
    { name: "Omega", crs: "OOO", arr: { gbtt: "11:00", wtt: "11:00" } },
  ]) as { service: { scheduleMetadata: Record<string, unknown> } };
  body.service.scheduleMetadata.modeType = mode;
  return build(parseService(body, () => now), now);
};

describe("a bus or ship shows the timetable it says it shows", () => {
  it("20 min after it was due to leave, every stop shows the booked time, with no countdown", () => {
    const tl = bus(clock(10, 20));
    for (const v of tl.points) {
      for (const s of [v.arrival, v.departure]) if (s) expect(s.source).toBe("booked");
    }
    expect(timetableOnly(tl)).toBe(true);
    const at = stopSummary(tl, "MMM", true);
    expect(at?.timetableOnly).toBe(true);
    expect(at?.minutes).toBeNull();
  });

  it("a train at the same moment is still followed, with our estimate", () => {
    const tl = bus(clock(10, 20), "TRAIN");
    expect(timetableOnly(tl)).toBe(false);
    expect(stopSummary(tl, "MMM", true)?.minutes).not.toBeNull();
  });

  it("long after, the headline names a bus or a ship, not a train", () => {
    expect(bus(clock(13, 0)).position.headline).toContain("No reports for this bus");
    expect(bus(clock(13, 0), "SHIP").position.headline).toContain("No reports for this ship");
    expect(bus(clock(13, 0), "TRAIN").position.headline).toContain("No reports for this train");
  });
});
