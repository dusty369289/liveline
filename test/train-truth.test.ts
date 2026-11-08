// The train page is plain about what it doesn't know: RTT's feed down, a train never reported, a train altered or
// cancelled. AGENTS.md, "Be plain about limits".
import { describe, expect, it } from "vitest";
import { build, resolveStops, stopSummary, yourStops } from "../src/core/engine";
import { feedOf, rowCancelled } from "../src/core/models";
import { parseBoard, parseService, parseSystemStatus } from "../src/core/parse";
import { pollAfter } from "../src/core/poll";
import type { ServiceResult } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { liveRegion } from "../src/ui/views/live-region";
import { fixture } from "./support";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

describe("when Realtime Trains has no live data", () => {
  // The Gatwick to Reading recording, 30 minutes after a report was due, with RTT's core on the timetable only
  const body = clone(fixture("real_service_C42388_20261107-1526.json")) as any;
  body.systemStatus = { realtimeNetworkRail: "OK", rttCore: "SCHEDULE_ONLY" };
  const now = fromLondon(2026, 11, 7, 15, 57);

  it("reads the feed's state from the answer", () => {
    expect(feedOf(parseSystemStatus(body))).toBe("none");
    expect(feedOf(parseSystemStatus(fixture("real_service_C42388_20261107-1526.json")))).toBe("ok");
    expect(feedOf(parseSystemStatus({}))).toBe("ok");
    expect(feedOf({ networkRail: "REALTIME_DATA_NONE", core: "OK" })).toBe("none");
    expect(feedOf({ networkRail: "OK", core: "REALTIME_DEGRADED" })).toBe("limited");
  });

  it("an overdue report blames the feed, not a signal", () => {
    const tl = build(parseService(body, () => now), now, undefined, feedOf(parseSystemStatus(body)));
    expect(tl.position.state).toBe("overdue");
    expect(tl.position.headline).not.toMatch(/signal/i);
    expect(tl.position.headline).toContain("Realtime Trains has no live data right now");
  });

  it("with the feed working, the overdue sentence is unchanged", () => {
    const tl = build(parseService(body, () => now), now);
    expect(tl.position.headline).toMatch(/held at a signal/);
  });

  it("the train page says the times are the timetable only", () => {
    const status = parseSystemStatus(body);
    const res = { timeline: build(parseService(body, () => now), now, undefined, feedOf(status)), status,
      fetched: { body, fetchedAt: now, stale: false, note: null }, refreshAfter: null } as unknown as ServiceResult;
    expect(liveRegion(res, null, null).value).toContain("times are the timetable only");
    const ok = { ...res, status: parseSystemStatus(fixture("real_service_C42388_20261107-1526.json")) };
    expect(liveRegion(ok, null, null).value).not.toContain("data-feed-note");
  });
});

const region = (tl: ReturnType<typeof build>, at = "", to = "") =>
  liveRegion({ timeline: tl, status: { networkRail: "OK", core: "OK" }, fetched: { body: null, fetchedAt: tl.now, stale: false, note: null },
    refreshAfter: null } as unknown as ServiceResult, ...yourStops(tl, at, to)).value;
const count = (h: string, s: string) => h.split(s).length - 1;

describe("a station called at twice (spec_service_loop.json, Mount Florida out and back)", () => {
  const now = fromLondon(2026, 11, 7, 10, 3);
  const tl = build(parseService(fixture("spec_service_loop.json"), () => now), now);

  it("you get off at the first call after where you got on", () => {
    expect(resolveStops(tl, "CCT", "MFL")).toEqual({ at: 2, to: 3 });
    expect(resolveStops(tl, "GLC", "GLC")).toEqual({ at: 0, to: 4 });
    expect(resolveStops(tl, "MFL", "")).toEqual({ at: 1, to: null });
    expect(resolveStops(tl, "", "MFL")).toEqual({ at: null, to: 1 });
    expect(resolveStops(tl, "XYZ", "MFL")).toEqual({ at: null, to: 1 });
    expect(yourStops(tl, "CCT", "MFL")[1]!.index).toBe(3);
  });

  it("exactly one row is your stop, one Board and one Alight", () => {
    for (const [at, to] of [["CCT", "MFL"], ["GLC", "GLC"], ["MFL", "GLC"]]) {
      const h = region(tl, at, to);
      expect(count(h, 'id="your-stop"'), `${at} to ${to}`).toBe(1);
      expect(count(h, 'route__tag">Board<'), `${at} to ${to}`).toBe(1);
      expect(count(h, 'route__tag">Alight<'), `${at} to ${to}`).toBe(1);
    }
    expect(region(tl, "CCT", "MFL")).toMatch(/data-index="3"[^>]*>\s*<span class="route__mark"[^]*?Alight/);
  });

  it("polling looks at where you get on", () => {
    expect(pollAfter(tl, now, 30, "CCT")).not.toBeNull();
  });
});
const rowOf = (h: string, name: string) => h.split('<li class="route__pt').find((r) => r.includes(`>${name}<`)) ?? "";

describe("a train terminated short (spec_service_terminates_short.json, at Slough)", () => {
  const body = fixture("spec_service_terminates_short.json") as any;
  const svc = parseService(body, () => fromLondon(2026, 11, 7, 10));
  const slough = svc.points.findIndex((p) => p.crs === "SLO");

  it("the departure board still shows it Cancelled at Slough", () => {
    const loc = body.service.locations[slough];
    const board = parseBoard({ services: [{ ...loc, scheduleMetadata: body.service.scheduleMetadata, origin: body.service.origin,
      destination: body.service.destination }] }, { fallbackName: "Slough", timeFrom: 0, timeTo: 1 });
    expect(rowCancelled(board.rows[0])).toBe(true);
  });

  it("the train page shows no departure from Slough, and says it now ends there", () => {
    const tl = build(svc, fromLondon(2026, 11, 7, 10, 12));
    expect(tl.points[slough].departure).toBeNull();
    expect(tl.points[slough].oursDeparture).toBeNull();
    expect(tl.points[slough].arrival?.time).toBe(fromLondon(2026, 11, 7, 10, 20));
    expect(rowOf(region(tl), "Slough")).toContain("Now ends here");
  });

  it("boarding at Slough is cancelled; getting off there isn't", () => {
    const tl = build(svc, fromLondon(2026, 11, 7, 10, 12));
    expect(stopSummary(tl, "SLO")!.status).toBe("cancelled");
    expect(stopSummary(tl, "SLO", false)!.status).toBe("ahead");
  });

  it("once in at Slough it has arrived: it never runs on toward Paddington", () => {
    const b = clone(body);
    b.service.locations[slough].temporalData.arrival.realtimeActual = "2026-11-07T10:21:00";
    const now = fromLondon(2026, 11, 7, 10, 25);
    const tl = build(parseService(b, () => now), now);
    expect(tl.position.state).toBe("arrived");
    expect(tl.position.fromIndex).toBe(slough);
    expect(pollAfter(tl, now, 30)).toBeNull();
  });

  it("a train that now starts part way says so", () => {
    const b = clone(body);
    b.service.locations[1].temporalData.displayAs = "STARTS";
    b.service.locations[1].temporalData.arrival.isCancelled = true;
    const tl = build(parseService(b, () => 0), fromLondon(2026, 11, 7, 10, 12));
    expect(tl.points[1].arrival).toBeNull();
    expect(rowOf(region(tl), "Twyford")).toContain("Now starts here");
  });
});

describe("a fully cancelled train (spec_service_reading_paddington.json, every stop cancelled)", () => {
  const body = clone(fixture("spec_service_reading_paddington.json")) as any;
  for (const loc of body.service.locations) {
    loc.temporalData.displayAs = "CANCELLED";
    for (const k of ["arrival", "departure", "pass"]) {
      if (loc.temporalData[k]) {
        loc.temporalData[k].isCancelled = true;
        delete loc.temporalData[k].realtimeActual;
      }
    }
  }
  const now = fromLondon(2026, 11, 7, 9, 50);
  const tl = build(parseService(body, () => now), now);

  it("is cancelled and stops asking", () => {
    expect(tl.position.state).toBe("cancelled");
    expect(pollAfter(tl, now, 30)).toBeNull();
  });

  it("is cancelled at your stop", () => {
    expect(stopSummary(tl, "SLO")!.status).toBe("cancelled");
    expect(stopSummary(tl, "MAI")!.status).toBe("cancelled");
  });
});
