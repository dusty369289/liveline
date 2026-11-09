// The allowance (core/budget.ts): RTT's limits, its headers and waits, the search reserve, and when spent windows free
// up again (minute, hour and day by the clock; the week rolling).
import { beforeEach, describe, expect, it } from "vitest";
import { Budget } from "../src/core/budget";
import { fromLondon } from "../src/core/time";
import { Clock } from "./support";

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
  // RTT's minute and hour are the clock's (seen 2026-11-08: a full 10 again at 22:19:06 after a call at 22:18:54, and a
  // full 100 at 23:00:08 after calls from 22:20). So the hour's calls all come back at the top of the hour.
  it("paces what's left of the hour over the time until it turns", () => {
    const b = new Budget(clock.now); // 14:20: 40 minutes left
    expect(b.refreshInterval()).toBe(30); // 2400 s ÷ 90 is under the floor
    b.observe(200, { "x-ratelimit-remaining-hour": "20" });
    expect(b.refreshInterval()).toBe(240); // 2400 s ÷ 10
    b.observe(200, { "x-ratelimit-remaining-hour": "5" });
    expect(b.refreshInterval()).toBe(600);
  });
  it("a spent hour frees at the top of the next one, all at once", () => {
    const b = new Budget(clock.now);
    for (let i = 0; i < 100; i++) {
      b.spend();
      clock.advance(10); // the minute never runs out (spend doesn't ask), the hour does, by 14:36:40
    }
    const top = fromLondon(2026, 11, 7, 15, 0);
    expect(b.remaining("hour")).toBe(0);
    expect(b.freeAt("hour", 1)).toBe(top);
    expect(b.freeAt("hour", 11)).toBe(top);
    clock.t = top - 1000;
    expect(b.remaining("hour")).toBe(0);
    clock.t = top;
    expect(b.remaining("hour")).toBe(100);
    expect(b.remaining("day")).toBe(900); // the day hasn't turned
  });
  // Seen 2026-11-09: a full 1000 for the day at 00:00:09 UTC (915 at 23:02); the week didn't turn with it
  it("a spent day frees at midnight (UTC), all at once; the week stays a rolling seven days", () => {
    clock.t = Date.UTC(2026, 10, 8, 23, 0);
    const b = new Budget(clock.now);
    b.observe(200, { "x-ratelimit-remaining-day": "0", "x-ratelimit-remaining-week": "0" });
    expect(b.freeAt("day", 1)).toBe(Date.UTC(2026, 10, 9));
    expect(b.freeAt("week", 1)).toBe(clock.t + 7 * 86_400_000);
    clock.t = Date.UTC(2026, 10, 9, 0, 0, 1);
    expect(b.remaining("day")).toBe(1000);
  });
  it("a spent minute frees at the top of the next minute", () => {
    clock.t = fromLondon(2026, 11, 7, 14, 20) + 50_000;
    const b = new Budget(clock.now);
    for (let i = 0; i < 10; i++) b.spend();
    expect(b.canSpend(true)).toBe(false);
    expect(b.freeAt("minute", 1)).toBe(fromLondon(2026, 11, 7, 14, 21));
  });
  it("a header saying the hour is spent holds until the hour turns, not for an hour", () => {
    const b = new Budget(clock.now);
    b.observe(200, { "x-ratelimit-remaining-hour": "0" });
    expect(b.freeAt("hour", 1)).toBe(fromLondon(2026, 11, 7, 15, 0));
    clock.t = fromLondon(2026, 11, 7, 15, 0);
    expect(b.remaining("hour")).toBe(100); // the old header belongs to the last hour
  });
});
