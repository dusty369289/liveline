// The train page for a train on another day: it says the day once, and the big number gives the time rather than
// thousands of minutes; the countdown keeps going between polls. The simulator stands in for RTT.
import { describe, expect, it } from "vitest";
import { stopSummary } from "../src/core/stops";
import { Rail } from "../src/core/rail";
import { fromLondon, type Ms } from "../src/core/time";
import { html } from "../src/ui/html";
import { countText } from "../src/ui/views/live-region";
import { trainView } from "../src/ui/views/train";
import { Clock, MemStore, simulator, stations } from "./support";

const NOW = fromLondon(2026, 11, 7, 9, 20); // a Saturday

/**
 * The train page for the first train on a board, opened from that board (or, with `at` "", from Recent). `to` is
 * where you get off: a station code, or "last" for the train's last stop.
 */
async function trainFrom(station: string, when: Ms, at = station, now = NOW, to = "") {
  const clock = () => now;
  const rail = new Rail(simulator(clock), new MemStore(), stations, clock);
  await rail.setKey("k".repeat(40));
  const board = await rail.board({ station, when });
  const uid = board.rows[0].uniqueId;
  const res = await rail.service(uid, { at, to });
  const tl = res.timeline;
  const off = to === "last" ? tl.points.filter((v) => v.point.kind === "call").at(-1)!.point.crs! : to;
  return String(trainView(res, uid, at, off, stopSummary(tl, at), stopSummary(tl, off, false), { tab: "route", scene: html``, now }));
}

const h1 = (page: string) => /<h1>([\s\S]*?)<\/h1>/.exec(page)![1];
const heroOf = (page: string) => /<p class="live__hero">([\s\S]*?)<\/p>/.exec(page)?.[1] ?? "";

describe("a train on another day", () => {
  it("says its day in the title, and the big number is its time, not minutes", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 9, 8, 0));
    expect(h1(page)).toContain("Mon 9 Nov");
    const hero = heroOf(page);
    expect(hero).toMatch(/live__hero-num">08:\d\d/);
    expect(hero).not.toMatch(/live__hero-unit">min/);
  });

  it("opened with both stops, nothing counts down thousands of minutes, and the day shows once", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 9, 8, 0), "WAT", NOW, "last");
    expect(page).toMatch(/class="live__stop">It reaches/);
    expect(page).not.toMatch(/in \d+ min/);
    expect(page.match(/Mon 9 Nov/g)).toHaveLength(1);
  });

  it("an overnight train shows its own day for a stop after midnight", async () => {
    // W19607: Waterloo 23:35 on Saturday, Woking 00:09 on Sunday, seen on Saturday morning
    const fromRecent = await trainFrom("WAT", fromLondon(2026, 11, 7, 23, 35), "", NOW, "WOK");
    expect(heroOf(fromRecent)).toMatch(/live__hero-num">00:09<\/span><span class="live__hero-unit">Sun 8 Nov/);
    const both = await trainFrom("WAT", fromLondon(2026, 11, 7, 23, 35), "WAT", NOW, "WOK");
    expect(heroOf(both)).not.toContain("Sat 7 Nov");
    expect(both).toMatch(/It reaches <strong>Woking<\/strong> at <strong[^>]*>00:09<\/strong> Sun 8 Nov/);
  });

  it("opened without a stop, the title carries the day and the not-started line doesn't repeat it", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 9, 8, 0), "");
    expect(heroOf(page)).toBe("");
    expect(/<p class="live__headline[^"]*">([^<]*)<\/p>/.exec(page)![1]).toMatch(/^Not started yet/);
    expect(page.match(/Mon 9 Nov/g)).toHaveLength(1);
  });

  it("a train later today keeps the plain title, and over 3 hours off shows its time, not minutes", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 7, 14, 30));
    expect(h1(page)).not.toContain("Sat 7 Nov");
    const hero = heroOf(page);
    expect(hero).not.toMatch(/live__hero-unit">min/);
    expect(hero).toMatch(/live__hero-num">14:\d\d/);
  });

  it("a train just past midnight still counts down in minutes", async () => {
    const lateNight = fromLondon(2026, 11, 7, 23, 50);
    const page = await trainFrom("SUR", fromLondon(2026, 11, 8, 0, 0), "SUR", lateNight);
    const hero = heroOf(page);
    expect(hero).toMatch(/live__hero-unit">min/);
    expect(hero).not.toContain("Sun 8 Nov");
  });

  it("a train soon today still counts down in minutes", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 7, 9, 40));
    expect(h1(page)).not.toContain("Sat 7 Nov");
    expect(heroOf(page)).toMatch(/live__hero-unit">min/);
  });
});

describe("the countdown between polls (live-train.ts ticks it with countText)", () => {
  it("each minute on with no new answer, the big number is one less", async () => {
    const clock = new Clock(NOW);
    const page = await trainFrom("WAT", fromLondon(2026, 11, 7, 10, 0), "WAT", clock.t);
    const [, at, shown] = /live__hero-num" data-count-at="(\d+)">(\d+)</.exec(page)!;
    expect(countText(Number(at), clock.now(), true)).toBe(shown);
    clock.advance(60);
    expect(countText(Number(at), clock.now(), true)).toBe(String(Number(shown) - 1));
    clock.advance(60);
    expect(countText(Number(at), clock.now(), true)).toBe(String(Number(shown) - 2));
  });

  it("the other stop's 'in N min' ticks too, and the clock form keeps to the hero's rules", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 7, 10, 0), "WAT", NOW, "last");
    const [, at, shown] = /<span data-count-at="(\d+)">(, in \d+ min)<\/span>/.exec(page)!;
    expect(countText(Number(at), NOW, false)).toBe(shown);
    const t = NOW + 3 * 3_600_000;
    expect(countText(t, NOW, true)).toBe("180");
    expect(countText(t + 60_000, NOW, true)).toBe("12:21");
    expect(countText(t + 60_000, NOW, false)).toBe("");
    expect(countText(NOW + 59_000, NOW, true)).toBe("Due");
    expect(countText(NOW + 59_000, NOW, false)).toBe(", due now");
  });
});
