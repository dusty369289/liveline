// Calls nobody asked for: background work never spends the calls kept for searches, and a passing failure to check
// the key doesn't stick for the whole session.
import { beforeEach, describe, expect, it } from "vitest";
import { STORE } from "../src/core/keys";
import { BusyError, Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { Clock, FakeRtt, GOOD, MemStore, stations } from "./support";

const UID = "X1:2026-11-07";
let clock: Clock;
beforeEach(() => {
  clock = new Clock(fromLondon(2026, 11, 7, 14, 20));
});

/** A Rail opened with a key already saved on the device (and no saved access token). */
async function reopened(http: FakeRtt, key = GOOD): Promise<Rail> {
  const store = new MemStore();
  await store.set(STORE.key, key);
  const rail = new Rail(http, store, stations, clock.now);
  await rail.start();
  return rail;
}

describe("checking the key", () => {
  it("being offline once doesn't leave 'needs attention' up, and the next board asks in detail", async () => {
    const http = new FakeRtt();
    const rail = await reopened(http);
    http.offline = true;
    await expect(rail.board({ station: "RDG" })).rejects.toBeInstanceOf(BusyError);
    http.offline = false;
    await rail.board({ station: "RDG" });
    expect(rail.lastTokenError).toBeNull();
    const boards = http.params.filter((_, i) => http.calls[i] === "/gb-nr/location");
    expect(boards.at(-1)?.detailed).toBe("true");
  });

  it("a refused key still sticks, and isn't asked about again and again", async () => {
    const http = new FakeRtt();
    const rail = await reopened(http, "plausible-but-wrong-key-000000");
    await rail.tokenInfo();
    expect(rail.lastTokenError).toMatch(/didn't accept that key/);
    const n = http.calls.length;
    await rail.tokenInfo();
    expect(http.calls.length).toBe(n);
    expect(rail.lastTokenError).toMatch(/didn't accept that key/);
  });
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
