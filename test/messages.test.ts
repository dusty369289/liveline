// What the app says when something stops it: one plain sentence, the right cause, and one wait, not two.
import { describe, expect, it } from "vitest";
import { Budget } from "../src/core/budget";
import type { Http, HttpResponse } from "../src/core/http";
import { AllowanceError, BusyError, RttClient } from "../src/core/rtt";
import { fromLondon } from "../src/core/time";
import { problemView } from "../src/ui/views/home";
import { Clock } from "./support";

const ACCESS = "an-access-token-0123456789abcdef";
const ok: Http = {
  async get(path: string, _p: Record<string, string>, token?: string | null): Promise<HttpResponse> {
    if (token !== ACCESS) return { status: 401, headers: {}, body: { error: "no" } };
    if (path === "/api/info") return { status: 200, headers: {}, body: { api_version: "2026-07-25", credentials: { entitlements: [] } } };
    return { status: 200, headers: {}, body: { service: {} } };
  },
};
const text = (h: { value: string }) => h.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("when the allowance stops a call", () => {
  const clock = new Clock(fromLondon(2026, 11, 7, 9, 20));

  it("blames this key's hourly allowance, not Realtime Trains, and gives no wait of its own", async () => {
    const b = new Budget(clock.now);
    const c = new RttClient(ok, ACCESS, b, clock.now);
    await c.checkToken();
    b.observe(200, { "x-ratelimit-remaining-hour": "0" });
    const e = await c.service("X1:2026-11-07").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AllowanceError);
    expect(e).toBeInstanceOf(BusyError); // still retried like any busy answer
    expect((e as Error).message).toBe("This key's calls for this hour are used up. Searches work again as the hour's calls free up.");
    expect((e as BusyError).retryAt).toBeNull();
  });

  it("names the minute when only the minute's calls are gone", async () => {
    const b = new Budget(clock.now);
    const c = new RttClient(ok, ACCESS, b, clock.now);
    await c.checkToken();
    for (let i = 0; i < 10; i++) b.spend();
    const e = await c.service("X2:2026-11-07").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AllowanceError);
    expect((e as Error).message).toMatch(/this minute/);
  });

  it("when Realtime Trains says wait, the wait is the error's, not the message's", async () => {
    const b = new Budget(clock.now);
    const c = new RttClient(ok, ACCESS, b, clock.now);
    await c.checkToken();
    b.observe(429, { "retry-after": "300" });
    const e = await c.service("X3:2026-11-07").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BusyError);
    expect(e).not.toBeInstanceOf(AllowanceError);
    expect((e as BusyError).retryAt).toBe(clock.now() + 300_000);
    expect((e as Error).message).not.toMatch(/\d\d:\d\d|minutes|shortly/);
  });

  it("a refused key is told in plain words, with no HTTP status", async () => {
    const c = new RttClient(ok, "not-the-right-key-0123456789", new Budget(clock.now), clock.now);
    const e = await c.checkToken().catch((x: unknown) => x);
    expect((e as Error).message).toBe("Realtime Trains didn't accept that key. Check you copied all of it from api-portal.rtt.io.");
  });

  it("the problem page gives one wait: its own (longer after each failure), or the time Realtime Trains gave", () => {
    const allowance = text(problemView("Allowance used up", new AllowanceError("hour").message, { secs: 30, at: null }));
    expect(allowance).toMatch(/tries again by itself in 30 seconds/);
    expect(allowance).not.toMatch(/few minutes/);
    const at = clock.now() + 300_000;
    const told = text(problemView("Realtime Trains is busy", "Realtime Trains asked us to wait.", { secs: 30, at }));
    expect(told).toMatch(/tries again by itself at 09:25/);
    expect(told.match(/\d\d:\d\d/g)).toHaveLength(1);
    expect(told).not.toMatch(/30 seconds/);
  });
});
