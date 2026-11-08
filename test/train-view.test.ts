// The train page for a train on another day: it says the day, and the big number gives a day and time rather than
// thousands of minutes. The simulator stands in for RTT.
import { describe, expect, it } from "vitest";
import { stopSummary } from "../src/core/engine";
import { Rail } from "../src/core/rail";
import { SimTransport } from "../src/core/simulator";
import { fromLondon, type Ms } from "../src/core/time";
import { html } from "../src/ui/html";
import { trainView } from "../src/ui/views/train";
import { MemStore, stations } from "./support";

const NOW = fromLondon(2026, 11, 7, 9, 20); // a Saturday

/** The train page for the first train on a board, opened from that board (or, with `at` "", from Recent). */
async function trainFrom(station: string, when: Ms, at = station, now = NOW) {
  const clock = () => now;
  const rail = new Rail(new SimTransport(clock), new MemStore(), stations, clock);
  await rail.setKey("k".repeat(40));
  const board = await rail.board({ station, when });
  const uid = board.rows[0].uniqueId;
  const res = await rail.service(uid, { at });
  const tl = res.timeline;
  return String(trainView(res, uid, at, "", stopSummary(tl, at), null, { tab: "route", scene: html``, now }));
}

const h1 = (page: string) => /<h1>([\s\S]*?)<\/h1>/.exec(page)![1];
const heroOf = (page: string) => /<p class="live__hero">([\s\S]*?)<\/p>/.exec(page)?.[1] ?? "";

describe("a train on another day", () => {
  it("says its day in the title, and the big number is a day and time, not minutes", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 9, 8, 0));
    expect(h1(page)).toContain("Mon 9 Nov");
    const hero = heroOf(page);
    expect(hero).toContain("Mon 9 Nov");
    expect(hero).not.toMatch(/live__hero-unit">min/);
  });

  it("opened without a stop, the not-started line says the day", async () => {
    const page = await trainFrom("WAT", fromLondon(2026, 11, 9, 8, 0), "");
    expect(heroOf(page)).toBe("");
    expect(/<p class="live__headline[^"]*">([^<]*)<\/p>/.exec(page)![1]).toMatch(/Mon 9 Nov.*Not started yet/);
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
