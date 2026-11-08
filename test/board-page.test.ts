// The board page's own behaviour, without a browser: which boards keep themselves fresh. Demo mode (the simulator),
// with fake timers so "2 minutes later" takes no time.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rail } from "../src/core/rail";
import { fromLondon, isoDate } from "../src/core/time";
import { BoardPage, BOARD_REFRESH } from "../src/ui/pages/board";
import { parseHash } from "../src/ui/routes";
import { Clock, MemStorage, MemStore, pageContext, stations } from "./support";

const NOW = fromLondon(2026, 11, 7, 9, 20);

/** Just enough of the page for mount(): the board's data, and nothing else to wire. */
const fakeRoot = () => ({ querySelector: (sel: string) => (sel === "[data-board]" ? { dataset: {} } : null) }) as unknown as HTMLElement;

let clock: Clock;
let rail: Rail;
beforeEach(() => {
  MemStorage.install();
  vi.useFakeTimers({ now: NOW });
  vi.stubGlobal("document", { visibilityState: "visible" });
  clock = new Clock(NOW);
  rail = new Rail({ get: () => Promise.reject(new Error("no network")) }, new MemStore(), stations, clock.now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openBoard(hash: string) {
  const page = new BoardPage(pageContext(rail), parseHash(hash));
  const view = String(await page.load(() => false));
  const board = vi.spyOn(rail, "board");
  page.mount(fakeRoot());
  return { page, view, board };
}

describe("a board keeps itself fresh only when it's for now", () => {
  it("a board for now says so and refreshes in the background", async () => {
    const { page, view, board } = await openBoard("#/board?station=PAD");
    expect(view).toContain("updates every 2 minutes");
    clock.advance(BOARD_REFRESH.every / 1000);
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH.every);
    expect(board).toHaveBeenCalledWith(expect.objectContaining({ background: true }));
    page.dispose();
  });

  it("a board for tomorrow, with only the day set, stays as it is", async () => {
    const tomorrow = isoDate(NOW + 86_400_000);
    const { page, view, board } = await openBoard(`#/board?station=PAD&day=${tomorrow}`);
    expect(view).toContain("Sun 8 Nov");
    expect(view).not.toContain("every 2 minutes");
    clock.advance(BOARD_REFRESH.every / 1000);
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH.every);
    expect(board).not.toHaveBeenCalled();
    page.dispose();
  });

  it("a board for today, picked by day only, is a board for now", async () => {
    const { page, view } = await openBoard(`#/board?station=PAD&day=${isoDate(NOW)}`);
    expect(view).toContain("updates every 2 minutes");
    page.dispose();
  });
});
