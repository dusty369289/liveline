// The train page is plain about what it doesn't know: RTT's feed down, a train never reported, a train altered or
// cancelled. AGENTS.md, "Be plain about limits".
import { describe, expect, it } from "vitest";
import { build } from "../src/core/engine";
import { feedOf } from "../src/core/models";
import { parseService, parseSystemStatus } from "../src/core/parse";
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
    expect(liveRegion(res, "", "", null, null).value).toContain("times are the timetable only");
    const ok = { ...res, status: parseSystemStatus(fixture("real_service_C42388_20261107-1526.json")) };
    expect(liveRegion(ok, "", "", null, null).value).not.toContain("data-feed-note");
  });
});
