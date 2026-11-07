// Boards fetch FETCH_WINDOW minutes in one call and serve every narrower board inside it, so Later, Earlier and the
// minute ticking over cost nothing. The simulator stands in for RTT and counts the calls.
import { describe, expect, it } from "vitest";
import { Rail } from "../src/core/rail";
import type { KeyValueStore } from "../src/core/rtt";
import { FETCH_WINDOW, FUTURE_BOARD_TTL } from "../src/core/rtt";
import { SimTransport } from "../src/core/simulator";
import { StationIndex } from "../src/core/stations";
import { fromLondon, type Ms } from "../src/core/time";
import raw from "../src/data/stations.json";

class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  async get(k: string) {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.data.set(k, v);
  }
  async remove(k: string) {
    this.data.delete(k);
  }
}

const stations = StationIndex.fromRaw(raw as Record<string, unknown>[]);
const KEY = "k".repeat(40);

async function setup(start: Ms) {
  let now = start;
  const clock = () => now;
  const sim = new SimTransport(clock);
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
