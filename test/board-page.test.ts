// A "now" board keeps itself fresh in the background. These drive BoardPage's wiring against the simulator with a
// stand-in DOM (support.ts): background board calls wait until the test lets them answer, so a slow one can be
// overtaken by navigation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BoardResult, Rail } from "../src/core/rail";
import { SimTransport } from "../src/core/simulator";
import { fromLondon } from "../src/core/time";
import { BOARD_REFRESH, BoardPage } from "../src/ui/pages/board";
import type { AppContext } from "../src/ui/pages/page";
import { parseHash } from "../src/ui/routes";
import { FakeDocument, FakeElement, MemStore, stations } from "./support";

const T0 = fromLondon(2026, 11, 7, 9, 0);

/** The parts of a drawn board that a refresh may replace or add to. */
const boardElement = () => new FakeElement({
  "[data-board-top]": new FakeElement(),
  "[data-board-body]": new FakeElement({ ".trains": new FakeElement(), ".empty": new FakeElement(), ".board__foot": new FakeElement() }),
});
const touched = (el: FakeElement): boolean => el.replacedWith.length > 0 || el.appended.length > 0 || Object.values(el.parts).some(touched);
const flush = () => new Promise((ok) => setTimeout(ok, 0)); // real timers: only intervals and Date are faked

beforeEach(() => {
  vi.useFakeTimers({ now: T0, toFake: ["setInterval", "clearInterval", "Date"] });
  FakeDocument.install();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A tiny App: one root whose board is swapped on navigation, a Rail on the simulator with background calls held. */
async function setup() {
  const rail = new Rail(new SimTransport(() => Date.now()), new MemStore(), stations, () => Date.now());
  await rail.setKey("k".repeat(40));
  const held: Array<() => Promise<void>> = [];
  const state = { edit: (r: BoardResult) => r };
  const board = rail.board.bind(rail);
  rail.board = (o) => {
    if (!o.background) return board(o).then((r) => state.edit(r));
    return new Promise((ok, no) => held.push(() => board(o).then((r) => ok(state.edit(r)), no)));
  };
  const ctx = { rail, stations: { remember() {} }, journeys: { has: () => false, toggle: () => false } } as unknown as AppContext;
  const root = new FakeElement();
  let page: BoardPage | null = null;
  return {
    held,
    state,
    async open(hash: string) {
      page?.dispose();
      const old = root.querySelector("[data-board]");
      if (old) old.isConnected = false;
      const next = new BoardPage(ctx, parseHash(hash));
      expect(await next.load(() => false)).not.toBeNull();
      const el = boardElement();
      root.parts = { "[data-board]": el };
      next.mount(root as unknown as HTMLElement);
      page = next;
      return el;
    },
    /** Let the oldest held background call answer, and the page act on it. */
    async release() {
      await held.shift()!();
      await flush();
    },
    leave: () => page?.dispose(),
  };
}

describe("a refreshing board", () => {
  it("a slow refresh never touches the board you've moved on to", async () => {
    const app = await setup();
    const dep = await app.open("#/board?station=PAD");
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH.every);
    expect(app.held.length).toBe(1); // a refresh is on its way
    const arr = await app.open("#/board?station=PAD&mode=arr");
    await app.release();
    expect(touched(arr)).toBe(false);
    expect(touched(dep)).toBe(false); // gone from the page: nothing to update
  });
});
