// Boards fetch FETCH_WINDOW minutes in one call and serve every narrower board inside it, so Later, Earlier and the
// minute ticking over cost nothing. The simulator stands in for RTT and counts the calls. Which rows a board shows is
// checked over a real recording and a spec-derived fixture.
import { describe, expect, it } from "vitest";
import { booked } from "../src/core/models";
import { BOARD_FILL, Rail } from "../src/core/rail";
import { FETCH_WINDOW, FUTURE_BOARD_TTL } from "../src/core/rtt";
import { fromLondon, type Ms } from "../src/core/time";
import { FakeRtt, fixture, GOOD, MemStore, simulator, stations } from "./support";

const KEY = "k".repeat(40);

async function setup(start: Ms) {
  let now = start;
  const clock = () => now;
  const sim = simulator(clock);
  const rail = new Rail(sim, new MemStore(), stations, clock);
  await rail.setKey(KEY);
  sim.requests.length = 0;
  const boards = () => sim.requests.filter(([p]) => p === "/gb-nr/location");
  return { rail, sim, boards, advance: (s: number) => (now += s * 1000), at: () => now };
}

describe("wide board fetches", () => {
  it(`one call covers now, Later and Later again (${FETCH_WINDOW} minutes)`, async () => {
    const t = fromLondon(2026, 11, 7, 9, 0);
    const { rail, boards } = await setup(t);
    await rail.board({ station: "PAD" });
    await rail.board({ station: "PAD", when: t + 60 * 60_000 });
    await rail.board({ station: "PAD", when: t + 120 * 60_000 });
    expect(boards().length).toBe(1);
    expect(boards()[0][1].timeWindow).toBe(String(FETCH_WINDOW));
    await rail.board({ station: "PAD", when: t + 150 * 60_000 }); // runs past the fetched three hours
    expect(boards().length).toBe(2);
    await rail.board({ station: "PAD", when: t - 60 * 60_000 }); // Earlier than anything fetched
    expect(boards().length).toBe(3);
  });

  it("shows exactly the rows a narrow fetch would have", async () => {
    const t = fromLondon(2026, 11, 7, 9, 0);
    const later = t + 60 * 60_000;
    const wide = await setup(t);
    await wide.rail.board({ station: "PAD" });
    const fromWide = await wide.rail.board({ station: "PAD", when: later }); // served from the 9:00 answer
    expect(wide.boards().length).toBe(1);
    const narrow = await setup(t);
    const fromNarrow = await narrow.rail.board({ station: "PAD", when: later }); // its own fetch from 10:00
    const ids = (r: typeof fromWide) => r.rows.map((x) => x.uniqueId);
    expect(ids(fromWide)).toEqual(ids(fromNarrow));
    expect(fromWide.rows.length).toBeGreaterThan(0);
    expect(fromWide.board.timeFrom).toBe(later);
  });

  it("a quiet board fills up to BOARD_FILL trains from the three hours already fetched, with no more calls", async () => {
    // Paddington calling at Oxford: two an hour, so the hour alone shows two (owner, 2026-11-08: "looks stupid")
    const t = fromLondon(2026, 11, 7, 9, 0);
    const { rail, boards } = await setup(t);
    const res = await rail.board({ station: "PAD", to: "OXF" });
    expect(boards().length).toBe(1);
    expect(res.rows.length).toBeGreaterThanOrEqual(BOARD_FILL);
    const times = res.rows.map((r) => booked(r.departure)!);
    expect(times.filter((x) => x >= t + 60 * 60_000).length).toBeGreaterThan(0); // some from past the hour
    expect(times.every((x) => x < t + FETCH_WINDOW * 60_000)).toBe(true); // all from what was fetched
    // the board says what it shows: from its start to its last train, and Later starts after that train
    const last = Math.max(...times);
    expect(res.board.timeTo).toBe(last);
    expect(res.next).toBe(last + 60_000);
    // and Later from there is served from the same answer, without repeating a train
    const later = await rail.board({ station: "PAD", to: "OXF", when: res.next });
    expect(later.rows.some((r) => res.rows.some((x) => x.uniqueId === r.uniqueId))).toBe(false);
  });

  it("a board with BOARD_FILL trains already shows just its window, as before", async () => {
    const t = fromLondon(2026, 11, 7, 9, 0);
    const { rail } = await setup(t);
    const res = await rail.board({ station: "PAD", window: 120 }); // the demo's Paddington: two hours is plenty
    expect(res.rows.length).toBeGreaterThanOrEqual(BOARD_FILL);
    expect(res.board.timeTo).toBe(t + 120 * 60_000);
    expect(res.next).toBe(t + 120 * 60_000);
  });

  it("with fewer than BOARD_FILL in the whole three hours, shows them all and says the board runs to the end", async () => {
    const t = fromLondon(2026, 11, 7, 23, 0); // late: the railway is closing
    const { rail, boards } = await setup(t);
    const res = await rail.board({ station: "PAD", to: "OXF" });
    expect(boards().length).toBe(1);
    expect(res.rows.length).toBeLessThan(BOARD_FILL);
    expect(res.board.timeTo).toBe(t + FETCH_WINDOW * 60_000);
    expect(res.next).toBe(t + FETCH_WINDOW * 60_000);
  });

  it("a different filter or mode is a different question", async () => {
    const t = fromLondon(2026, 11, 7, 9, 0);
    const { rail, boards } = await setup(t);
    await rail.board({ station: "PAD" });
    await rail.board({ station: "PAD", to: "OXF" });
    await rail.board({ station: "PAD", to: "OXF", mode: "arr" });
    expect(boards().length).toBe(3);
  });

  it("boards near now are kept a minute; boards an hour or more ahead for five", async () => {
    const t = fromLondon(2026, 11, 7, 9, 0);
    const near = await setup(t);
    await near.rail.board({ station: "PAD" });
    near.advance(61);
    await near.rail.board({ station: "PAD" });
    expect(near.boards().length).toBe(2);

    const far = await setup(t);
    const ahead = t + 90 * 60_000;
    await far.rail.board({ station: "PAD", when: ahead });
    far.advance(FUTURE_BOARD_TTL - 10);
    await far.rail.board({ station: "PAD", when: ahead });
    expect(far.boards().length).toBe(1);
    far.advance(20);
    await far.rail.board({ station: "PAD", when: ahead });
    expect(far.boards().length).toBe(2);
  });

  it("Refresh still asks again", async () => {
    const t = fromLondon(2026, 11, 7, 9, 0);
    const { rail, boards, advance } = await setup(t);
    await rail.board({ station: "PAD" });
    advance(20);
    await rail.board({ station: "PAD", force: true });
    expect(boards().length).toBe(2);
  });
});

/** A Rail with a working key whose every board is `answer` (an RTT recording or a spec-derived fixture). */
async function railAnswering(answer: string, now: Ms) {
  const rail = new Rail(new FakeRtt(undefined, undefined, null, fixture(answer)), new MemStore(), stations, () => now);
  await rail.setKey(GOOD);
  return rail;
}

describe("which rows a board shows", () => {
  const RDG = "real_location_RDG_20261107-1526.json";
  const at1526 = fromLondon(2026, 11, 7, 15, 26);

  it("departures leave out set-down-only calls, arrivals pick-up-only ones", async () => {
    const rail = await railAnswering(RDG, at1526);
    const dep = await rail.board({ station: "RDG", showAll: true });
    expect(dep.rows.length).toBeGreaterThan(0);
    expect(dep.rows.filter((r) => r.callType === "ADVERTISED_SET_DOWN")).toEqual([]);
    const arr = await rail.board({ station: "RDG", mode: "arr", showAll: true });
    expect(arr.rows.length).toBeGreaterThan(0);
    expect(arr.rows.filter((r) => r.callType === "ADVERTISED_PICK_UP")).toEqual([]);
  });

  it("a set-down-only call with a departure time is an arrival, not a departure", async () => {
    const rail = await railAnswering("spec_location_late_before_window.json", fromLondon(2026, 11, 7, 9, 0));
    expect((await rail.board({ station: "RDG" })).rows.map((r) => r.identity)).not.toContain("C70006");
    expect((await rail.board({ station: "RDG", mode: "arr" })).rows.map((r) => r.identity)).toContain("C70006");
  });

  it("hides empty stock and staff-only calls, and counts them, unless show all", async () => {
    const rail = await railAnswering(RDG, at1526);
    const shown = await rail.board({ station: "RDG" });
    expect(shown.hidden).toBe(2); // the recording's two OPERATIONAL_ONLY departures in the hour
    expect(shown.rows.filter((r) => r.callType === "OPERATIONAL_ONLY" || !r.passenger)).toEqual([]);
    const all = await rail.board({ station: "RDG", showAll: true });
    expect(all.hidden).toBe(0);
    expect(all.rows.filter((r) => r.callType === "OPERATIONAL_ONLY").length).toBe(2);
    expect(all.rows.length).toBe(shown.rows.length + 2);
  });

  it("keeps a train booked before the window only while it's still to leave, late, into it", async () => {
    const rail = await railAnswering("spec_location_late_before_window.json", fromLondon(2026, 11, 7, 9, 0));
    const { rows } = await rail.board({ station: "RDG" });
    // C70001 forecast 09:03: shown. C70002 left 08:58 and C70003 forecast 08:59: gone before 09:00. C70004 left
    // 09:02: late into the window, but gone.
    expect(rows.map((r) => r.identity)).toEqual(["C70001", "C70005"]);
  });
});
