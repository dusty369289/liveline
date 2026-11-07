// The Recent tab's list: newest first, one entry per train, the old single "tracking" entry carried over.
import { beforeEach, describe, expect, it } from "vitest";
import { carryOn, forgetTrains, isRunning, recentTrains, rememberTrain } from "../src/ui/recents";

class Mem {
  d = new Map<string, string>();
  getItem(k: string) { return this.d.has(k) ? this.d.get(k)! : null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
  clear() { this.d.clear(); }
}

const H = 3_600_000;
const t0 = Date.UTC(2026, 10, 7, 9, 0);
const train = (id: string, ends: number, seen: number, stop = "") =>
  ({ href: `#/train/${id}${stop}`, title: `Train ${id}`, ends, seen });

beforeEach(() => {
  (globalThis as unknown as { localStorage: Mem }).localStorage = new Mem();
});

describe("recent trains", () => {
  it("lists newest first and keeps one entry per train, whichever stop it was opened from", () => {
    rememberTrain(train("A:2026-11-07", t0 + H, t0, "?at=PAD"));
    rememberTrain(train("B:2026-11-07", t0 + H, t0 + 1000));
    rememberTrain(train("A:2026-11-07", t0 + H, t0 + 2000, "?at=RDG"));
    const list = recentTrains();
    expect(list.map((t) => t.href)).toEqual(["#/train/A:2026-11-07?at=RDG", "#/train/B:2026-11-07"]);
  });

  it("keeps the 30 newest", () => {
    for (let i = 0; i < 40; i++) rememberTrain(train(`T${i}:2026-11-07`, t0, t0 + i));
    const list = recentTrains();
    expect(list.length).toBe(30);
    expect(list[0].href).toBe("#/train/T39:2026-11-07");
  });

  it("carries over the train an older version was following", () => {
    localStorage.setItem("liveline.tracking", JSON.stringify(train("OLD:2026-11-07", t0 + H, t0)));
    expect(recentTrains().map((t) => t.href)).toEqual(["#/train/OLD:2026-11-07"]);
  });

  it("is running until half an hour after it's due in; the search page offers the newest running one", () => {
    const done = train("DONE:2026-11-07", t0 - 2 * H, t0 - 3 * H);
    const live = train("LIVE:2026-11-07", t0 + H, t0 - H);
    expect(isRunning(done, t0)).toBe(false);
    expect(isRunning(live, t0)).toBe(true);
    expect(isRunning(train("X:2026-11-07", t0 - 20 * 60_000, t0 - H), t0)).toBe(true); // 20 min past due: still
    rememberTrain(live);
    rememberTrain(done); // opened more recently, but finished
    expect(carryOn(t0)?.href).toBe(live.href);
  });

  it("can be cleared", () => {
    rememberTrain(train("A:2026-11-07", t0 + H, t0));
    forgetTrains();
    expect(recentTrains()).toEqual([]);
    expect(carryOn(t0)).toBeNull();
  });
});
