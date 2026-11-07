// The Recent tab's list: newest first, one entry per train, the old single "tracking" entry carried over.
import { beforeEach, describe, expect, it } from "vitest";
import { KEYS } from "../src/ui/store/keys";
import { type RecentTrain, RecentTrains } from "../src/ui/store/recent-trains";
import { MemStorage } from "./support";

const H = 3_600_000;
const t0 = Date.UTC(2026, 10, 7, 9, 0);
const train = (id: string, ends: number, seen: number, stop = ""): RecentTrain =>
  ({ href: `#/train/${id}${stop}`, title: `Train ${id}`, ends, seen });

let storage: MemStorage;
let trains: RecentTrains;
beforeEach(() => {
  storage = MemStorage.install();
  trains = new RecentTrains();
});

describe("recent trains", () => {
  it("lists newest first and keeps one entry per train, whichever stop it was opened from", () => {
    trains.remember(train("A:2026-11-07", t0 + H, t0, "?at=PAD"));
    trains.remember(train("B:2026-11-07", t0 + H, t0 + 1000));
    trains.remember(train("A:2026-11-07", t0 + H, t0 + 2000, "?at=RDG"));
    expect(trains.all().map((t) => t.href)).toEqual(["#/train/A:2026-11-07?at=RDG", "#/train/B:2026-11-07"]);
  });

  it(`keeps the ${RecentTrains.MAX} newest`, () => {
    for (let i = 0; i < 40; i++) trains.remember(train(`T${i}:2026-11-07`, t0, t0 + i));
    const list = trains.all();
    expect(list.length).toBe(RecentTrains.MAX);
    expect(list[0].href).toBe("#/train/T39:2026-11-07");
  });

  it("carries over the train an older version was following", () => {
    storage.setItem(KEYS.tracking, JSON.stringify(train("OLD:2026-11-07", t0 + H, t0)));
    expect(trains.all().map((t) => t.href)).toEqual(["#/train/OLD:2026-11-07"]);
  });

  it("is running until half an hour after it's due in; the search page offers the newest running one", () => {
    const done = train("DONE:2026-11-07", t0 - 2 * H, t0 - 3 * H);
    const live = train("LIVE:2026-11-07", t0 + H, t0 - H);
    expect(RecentTrains.isRunning(done, t0)).toBe(false);
    expect(RecentTrains.isRunning(live, t0)).toBe(true);
    expect(RecentTrains.isRunning(train("X:2026-11-07", t0 - 20 * 60_000, t0 - H), t0)).toBe(true); // 20 min past due
    trains.remember(live);
    trains.remember(done); // opened more recently, but finished
    expect(trains.carryOn(t0)?.href).toBe(live.href);
  });

  it("can be cleared", () => {
    trains.remember(train("A:2026-11-07", t0 + H, t0));
    trains.clear();
    expect(trains.all()).toEqual([]);
    expect(trains.carryOn(t0)).toBeNull();
  });
});
