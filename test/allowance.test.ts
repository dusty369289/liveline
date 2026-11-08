// Calls nobody asked for: background work never spends the calls kept for searches.
import { beforeEach, describe, expect, it } from "vitest";
import { BusyError, Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { Clock, FakeRtt, GOOD, MemStore, stations } from "./support";

const UID = "X1:2026-11-07";
let clock: Clock;
beforeEach(() => {
  clock = new Clock(fromLondon(2026, 11, 7, 14, 20));
});

describe("background calls never spend the search reserve", () => {
  it("with only the reserve left, background boards and trains send nothing; searches and taps still go", async () => {
    const http = new FakeRtt();
    http.remainingHour = "10"; // RTT says 10 left this hour: exactly the reserve
    const rail = new Rail(http, new MemStore(), stations, clock.now);
    await rail.setKey(GOOD);
    http.calls.length = 0;

    // nothing cached yet: background work says "busy" rather than spend a reserved call
    await expect(rail.board({ station: "RDG", background: true })).rejects.toBeInstanceOf(BusyError);
    await expect(rail.service(UID, { background: true })).rejects.toBeInstanceOf(BusyError);
    expect(http.calls).toEqual([]);

    // a search is what the reserve is for
    const at = clock.now();
    await rail.board({ station: "RDG", when: at });
    expect(http.calls).toEqual(["/gb-nr/location"]);

    // an old answer is shown again, marked stale, instead of asking; a "now" board a minute on has none to show
    clock.advance(120);
    const again = await rail.board({ station: "RDG", when: at, background: true });
    expect(again.fetched.stale).toBe(true);
    await expect(rail.board({ station: "RDG", background: true })).rejects.toBeInstanceOf(BusyError);
    expect(http.calls).toEqual(["/gb-nr/location"]);

    // a tapped refresh on a train (forced) is someone asking
    await rail.service(UID, { background: true, force: true });
    expect(http.calls).toEqual(["/gb-nr/location", "/gb-nr/service"]);
  });
});
