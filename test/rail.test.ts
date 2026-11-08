// An old answer served again (RTT down, or the hour's calls kept back) is judged against the clock now. Near the end of
// a journey that can look like a train we've given up on, though the next real answer would say Arrived: so a stale
// answer never ends a train for good. Only what RTT reported (arrived, cancelled) can.
import { beforeEach, describe, expect, it } from "vitest";
import type { HttpResponse } from "../src/core/http";
import { POLL } from "../src/core/poll";
import { Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { Clock, FakeRtt, type FakeLocation, fakeService, GOOD, MemStore, stations } from "./support";

const UID = "X12345:2026-11-07";
const MIN = 60;

/** Reported leaving Twyford at 07:39, due in at Paddington at 08:10; `arrived` adds its report there. */
const route = (arrived = false): FakeLocation[] => [
  { name: "Reading", crs: "RDG", dep: { gbtt: "07:30", wtt: "07:30", actual: "07:31" } },
  { name: "Twyford", crs: "TWY", arr: { gbtt: "07:37", wtt: "07:37", actual: "07:38" }, dep: { gbtt: "07:38", wtt: "07:38", actual: "07:39" } },
  { name: "Slough", crs: "SLO", arr: { gbtt: "07:51", wtt: "07:51" }, dep: { gbtt: "07:52", wtt: "07:52" } },
  { name: "London Paddington", crs: "PAD", arr: { gbtt: "08:10", wtt: "08:10", actual: arrived ? "08:12" : undefined } },
];

let clock: Clock;
let answer: HttpResponse;
let rail: Rail;

/** A keyed Rail whose train answer the test can change, opened at 07:50 with the answer cached. */
async function cached(locs: FakeLocation[], headers: Record<string, string> = {}): Promise<void> {
  answer = { status: 200, headers: { "x-ratelimit-limit-minute": "10", "x-ratelimit-limit-hour": "100", ...headers }, body: fakeService(locs) };
  rail = new Rail(new FakeRtt(undefined, "100", answer), new MemStore(), stations, clock.now);
  await rail.setKey(GOOD);
  const first = await rail.service(UID);
  expect(first.fetched.stale).toBe(false);
}

beforeEach(() => {
  clock = new Clock(fromLondon(2026, 11, 7, 7, 50));
});

describe("a stale answer near the end of a journey", () => {
  // due in at 08:11 at the latest (07:39 plus the booked 32 minutes): given up on past 08:41
  const lateEnough = (8 * 60 + 11 + 31 - (7 * 60 + 50)) * MIN;

  it("RTT down: keeps asking, and says it couldn't get a new answer, not that no report came", async () => {
    await cached(route());
    answer.status = 503;
    clock.advance(lateEnough);
    const res = await rail.service(UID, { background: true });
    expect(res.fetched.stale).toBe(true);
    expect(res.refreshAfter).not.toBeNull();
    expect(res.refreshAfter).toBeGreaterThanOrEqual(POLL.overdue);
    expect(res.timeline.position.headline).toMatch(/Couldn't get a new answer from Realtime Trains/);
    expect(res.timeline.position.headline).not.toMatch(/was not reported/);
  });

  it("the hour's calls kept back: keeps asking, no sooner than the allowance allows", async () => {
    await cached(route());
    clock.advance(lateEnough);
    // only the search reserve left, said in this hour (the hour is the clock's: one from 07:50 has gone by 08:42)
    rail.budget.observe(200, { "x-ratelimit-remaining-hour": "10" });
    const res = await rail.service(UID, { background: true });
    expect(res.fetched.stale).toBe(true);
    expect(res.refreshAfter).toBe(Math.max(POLL.overdue, rail.budget.refreshInterval()));
    expect(res.timeline.position.headline).toMatch(/Couldn't get a new answer/);
  });

  it("the next real answer saying Arrived then ends it", async () => {
    await cached(route());
    answer.status = 503;
    clock.advance(lateEnough);
    await rail.service(UID, { background: true });
    answer.status = 200;
    answer.body = fakeService(route(true));
    clock.advance(2 * MIN);
    const res = await rail.service(UID, { background: true });
    expect(res.timeline.position.state).toBe("arrived");
    expect(res.refreshAfter).toBeNull();
  });

  it("a stale answer that reported the arrival still ends it: RTT said so", async () => {
    await cached(route(true));
    answer.status = 503;
    clock.advance(lateEnough);
    const res = await rail.service(UID, { background: true });
    expect(res.fetched.stale).toBe(true);
    expect(res.timeline.position.state).toBe("arrived");
    expect(res.refreshAfter).toBeNull();
  });

  it("a fresh answer long past the end still gives up", async () => {
    clock.advance(lateEnough);
    await cached(route());
    const res = await rail.service(UID);
    expect(res.timeline.position.state).toBe("unreported");
    expect(res.timeline.position.headline).toMatch(/was not reported/);
    expect(res.refreshAfter).toBeNull();
  });
});
