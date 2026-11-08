// Budget, client, key handling and station search (carried over from the retired Python suite).
import { beforeEach, describe, expect, it } from "vitest";
import { Budget } from "../src/core/budget";
import type { Http } from "../src/core/http";
import { cleanToken, Rail } from "../src/core/rail";
import { AuthError, BusyError, RttClient, RttError } from "../src/core/rtt";
import { fromLondon } from "../src/core/time";
import { Clock, FakeRtt, GOOD, MemStore, stations } from "./support";

let clock: Clock;
beforeEach(() => {
  clock = new Clock(fromLondon(2026, 11, 7, 14, 20));
});

describe("budget", () => {
  it("starts at the free limits and counts", () => {
    const b = new Budget(clock.now);
    for (let i = 0; i < 10; i++) {
      expect(b.canSpend(true)).toBe(true);
      b.spend();
    }
    expect(b.canSpend(true)).toBe(false);
    clock.advance(61);
    expect(b.canSpend(true)).toBe(true);
  });
  it("before any headers, assumes the limits RTT sends free keys (seen 2026-11-08)", () => {
    expect(new Budget(clock.now).limits).toEqual({ minute: 10, hour: 100, day: 1000, week: 10000 });
  });
  it("trusts headers and keeps a reserve for searches", () => {
    const b = new Budget(clock.now);
    b.observe(200, { "x-ratelimit-limit-hour": "100", "x-ratelimit-remaining-hour": "10" });
    expect(b.remaining("hour")).toBe(10);
    expect(b.canSpend(true)).toBe(true);
    expect(b.canSpend(false)).toBe(false);
  });
  it("429 blocks until Retry-After", () => {
    const b = new Budget(clock.now);
    b.observe(429, { "retry-after": "30" });
    expect(b.canSpend(true)).toBe(false);
    clock.advance(31);
    expect(b.canSpend(true)).toBe(true);
  });
  it("slows refreshes when the hour runs low", () => {
    const b = new Budget(clock.now);
    expect(b.refreshInterval()).toBe(40);
    b.observe(200, { "x-ratelimit-remaining-hour": "20" });
    expect(b.refreshInterval()).toBe(360);
    b.observe(200, { "x-ratelimit-remaining-hour": "5" });
    expect(b.refreshInterval()).toBe(600);
  });
  it("knows when a spent hour frees up: when its oldest calls are an hour old", () => {
    const b = new Budget(clock.now);
    const first = clock.now();
    for (let i = 0; i < 100; i++) {
      b.spend();
      clock.advance(30); // two a minute: only the hour runs out
    }
    expect(b.remaining("hour")).toBe(0);
    expect(b.freeAt("hour", 1)).toBe(first + 3_600_000);
    expect(b.freeAt("hour", 11)).toBe(first + 10 * 30_000 + 3_600_000); // the 11th oldest call leaves
    expect(b.freeAt("minute", 1)).toBe(clock.now()); // not spent: free now
    clock.t = first + 3_600_000;
    expect(b.remaining("hour")).toBe(1);
  });
  it("a header saying the hour is spent holds until its hour is over", () => {
    const b = new Budget(clock.now);
    b.observe(200, { "x-ratelimit-remaining-hour": "0" });
    expect(b.freeAt("hour", 1)).toBe(clock.now() + 3_600_000);
  });
});

describe("client", () => {
  it("exchanges a refresh token and remembers it across launches", async () => {
    const fake = new FakeRtt();
    const store = new MemStore();
    const c = new RttClient(fake, GOOD, new Budget(clock.now), clock.now, store);
    await c.service("X1:2026-11-07");
    expect(c.info?.kind).toBe("refresh");
    const before = fake.calls.length;
    const again = new RttClient(fake, GOOD, new Budget(clock.now), clock.now, store);
    await again.service("X1:2026-11-07");
    expect(fake.calls.slice(before)).toEqual(["/gb-nr/service"]); // no re-authentication
  });
  it("ignores a remembered token that belongs to another key", async () => {
    const store = new MemStore();
    await new RttClient(new FakeRtt(), GOOD, new Budget(clock.now), clock.now, store).checkToken();
    const other = new FakeRtt();
    const c = new RttClient(other, "another-key-entirely-0000000000", new Budget(clock.now), clock.now, store);
    await expect(c.service("X1:2026-11-07")).rejects.toBeInstanceOf(AuthError);
  });
  it("a bad key says where to fix it", async () => {
    const c = new RttClient(new FakeRtt(), "wrong-key-wrong-key-wrong-key", new Budget(clock.now), clock.now);
    await expect(c.service("X1:2026-11-07")).rejects.toThrow(/api-portal/);
  });
  it("pressing refresh again and again costs one call", async () => {
    const fake = new FakeRtt();
    const c = new RttClient(fake, GOOD, new Budget(clock.now), clock.now);
    await c.service("X1:2026-11-07");
    const n = fake.calls.filter((p) => p === "/gb-nr/service").length;
    for (let i = 0; i < 20; i++) await c.service("X1:2026-11-07", true, null, true);
    expect(fake.calls.filter((p) => p === "/gb-nr/service").length).toBe(n);
    clock.advance(16);
    await c.service("X1:2026-11-07", true, null, true);
    await c.service("X1:2026-11-07", true, null, true);
    expect(fake.calls.filter((p) => p === "/gb-nr/service").length).toBe(n + 1);
  });
  it("the same question twice at once is one call", async () => {
    const fake = new FakeRtt();
    const c = new RttClient(fake, GOOD, new Budget(clock.now), clock.now);
    await c.checkToken();
    await Promise.all(Array.from({ length: 8 }, () => c.service("X1:2026-11-07")));
    expect(fake.calls.filter((p) => p === "/gb-nr/service").length).toBe(1);
  });
  it("never goes over 10 a minute, and says so in a sentence", async () => {
    const fake = new FakeRtt();
    const c = new RttClient(fake, GOOD, new Budget(clock.now), clock.now);
    let refused = 0;
    for (let i = 0; i < 30; i++) {
      try {
        await c.service(`X${i}:2026-11-07`, true, null, true);
      } catch (e) {
        expect(e).toBeInstanceOf(BusyError);
        refused++;
      }
    }
    expect(fake.calls.length).toBeLessThanOrEqual(10);
    expect(refused).toBeGreaterThan(0);
  });
  it("serves the last answer, marked stale, when it can't ask", async () => {
    const fake = new FakeRtt();
    const b = new Budget(clock.now);
    const c = new RttClient(fake, GOOD, b, clock.now);
    const first = await c.service("X1:2026-11-07");
    b.observe(200, { "x-ratelimit-remaining-hour": "0" });
    clock.advance(60);
    const again = await c.service("X1:2026-11-07");
    expect(again.stale).toBe(true);
    expect(again.body).toBe(first.body);
    expect(again.note).toMatch(/allowance/);
  });
  it("asks for detailed mode only when allowed", async () => {
    const seen: Record<string, string>[] = [];
    const fake = new FakeRtt([]);
    const spy: Http = { get: (p, params, t) => (seen.push(params), fake.get(p, params, t)) };
    const c = new RttClient(spy, GOOD, new Budget(clock.now), clock.now);
    await c.service("X1:2026-11-07");
    expect(seen[seen.length - 1].detailed).toBeUndefined();
  });
  it("404 and 400 are sentences, not crashes", async () => {
    const c = new RttClient(new FakeRtt(undefined, undefined, { status: 404, headers: {}, body: null }), GOOD, new Budget(clock.now), clock.now);
    await expect(c.service("X1:2026-11-07")).rejects.toThrow(/doesn't know/);
  });
});

describe("the app's key", () => {
  it("demo until a key is saved, then the key's plan", async () => {
    const store = new MemStore();
    const rail = new Rail(new FakeRtt(), store, stations, clock.now);
    await rail.start();
    expect(rail.demo).toBe(true);
    expect((await rail.tier()).name).toBe("Demo");
    await rail.setKey(` "${GOOD}" `);
    expect(rail.demo).toBe(false);
    expect((await rail.tier()).name).toBe("Hobbyist");
    expect(rail.tokenHint).toBe("…bcdef");
    const reopened = new Rail(new FakeRtt(), store, stations, clock.now);
    await reopened.start();
    expect(reopened.demo).toBe(false);
  });
  it("checks a key before keeping it", async () => {
    const store = new MemStore();
    const rail = new Rail(new FakeRtt(), store, stations, clock.now);
    await expect(rail.setKey("plausible-but-wrong-key-000000")).rejects.toBeInstanceOf(AuthError);
    expect(store.data.size).toBe(0);
    expect(rail.demo).toBe(true);
  });
  it("free and team plans are named", async () => {
    const free = new Rail(new FakeRtt([]), new MemStore(), stations, clock.now);
    await free.setKey(GOOD);
    expect((await free.tier()).name).toBe("Free");
    const team = new Rail(new FakeRtt(undefined, "1200"), new MemStore(), stations, clock.now);
    await team.setKey(GOOD);
    expect((await team.tier()).name).toBe("Team or above");
  });
  it("reopening the app reuses the saved access token: no key check, one call for the board", async () => {
    const store = new MemStore();
    const first = new Rail(new FakeRtt(), store, stations, clock.now);
    await first.setKey(GOOD);
    const http = new FakeRtt();
    const again = new Rail(http, store, stations, clock.now);
    await again.start();
    expect((await again.tier()).name).toBe("Hobbyist");
    await again.board({ station: "RDG" });
    expect(http.calls).toEqual(["/gb-nr/location"]);
  });
  it("a 'now' board seen again after the minute ticks over costs nothing", async () => {
    const http = new FakeRtt();
    const rail = new Rail(http, new MemStore(), stations, clock.now);
    await rail.setKey(GOOD);
    http.calls.length = 0;
    clock.advance(40); // 14:20:40
    await rail.board({ station: "RDG" });
    clock.advance(30); // 14:21:10: a new minute, but the answer is 30 s old
    await rail.board({ station: "RDG" });
    expect(http.calls).toEqual(["/gb-nr/location"]);
    clock.advance(40); // now over a minute old: worth asking again
    await rail.board({ station: "RDG" });
    expect(http.calls).toEqual(["/gb-nr/location", "/gb-nr/location"]);
  });
  it("removing the key forgets everything", async () => {
    const store = new MemStore();
    const rail = new Rail(new FakeRtt(), store, stations, clock.now);
    await rail.setKey(GOOD);
    await rail.removeKey();
    expect(rail.demo).toBe(true);
    expect(store.data.size).toBe(0);
  });
  it("a 200 that isn't RTT's answer (a captive portal, a misrouted relay) doesn't pass as a working key", async () => {
    const page: Http = { async get() { return { status: 200, headers: {}, body: { error: "<!doctype html><html>…" } }; } };
    const rail = new Rail(page, new MemStore(), stations, clock.now);
    await expect(rail.setKey(GOOD)).rejects.toThrow(RttError);
    expect(rail.demo).toBe(true);
  });
  it("junk is refused before any call", () => {
    for (const bad of ["", "short", "has spaces in the middle of it ok", "x".repeat(3000)]) {
      expect(() => cleanToken(bad)).toThrow(RttError);
    }
    expect(cleanToken(`RTT_TOKEN=${GOOD}`)).toBe(GOOD);
  });
});

describe("demo", () => {
  it("shows simulated trains with no key, and never runs out", async () => {
    const rail = new Rail(new FakeRtt(), new MemStore(), stations, clock.now);
    for (let i = 0; i < 40; i++) {
      const r = await rail.board({ station: "Reading", when: fromLondon(2026, 11, 7, 6 + (i % 12), i) });
      expect(r.board.stationName).toBe("Reading");
    }
    const r = await rail.board({ station: "RDG" });
    expect(r.rows.length).toBeGreaterThan(3);
    const t = await rail.service(r.rows[0].uniqueId);
    expect(t.timeline.points.length).toBeGreaterThan(5);
  });
  it("an unknown station is a sentence, not an empty board", async () => {
    const rail = new Rail(new FakeRtt(), new MemStore(), stations, clock.now);
    await expect(rail.board({ station: "zzqqxx" })).rejects.toThrow("Couldn't find a station called “zzqqxx”.");
  });
  it("a second station means 'calling at' for departures and 'coming from' for arrivals", async () => {
    const rail = new Rail(new FakeRtt(), new MemStore(), stations, clock.now);
    const when = fromLondon(2026, 11, 7, 8, 0);
    const dep = await rail.board({ station: "PAD", to: "OXF", when, window: 120 });
    const arr = await rail.board({ station: "PAD", to: "OXF", when, window: 120, mode: "arr" });
    expect(dep.rows.length).toBeGreaterThan(0);
    expect(arr.rows.length).toBeGreaterThan(0);
    expect(dep.rows.every((r) => r.destination === "Oxford")).toBe(true);
    expect(arr.rows.every((r) => r.origin === "Oxford")).toBe(true);
  });
});

describe("stations", () => {
  it("finds what people type", () => {
    expect(stations.stations.length).toBeGreaterThan(2500);
    expect(stations.search("rdg")[0].name).toBe("Reading");
    expect(stations.search("Reading")[0].crs).toBe("RDG");
    expect(stations.search("kings cross")[0].crs).toBe("KGX");
    expect(stations.search("clap jun")[0].crs).toBe("CLJ");
    expect(stations.search("padd")[0].crs).toBe("PAD");
    expect(stations.search("")).toEqual([]);
    expect(stations.resolve("Reading (RDG)")?.crs).toBe("RDG");
    expect(stations.resolve("zzzzqqq")).toBeUndefined();
  });
});
