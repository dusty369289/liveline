// A board row's live state reads its lateness the way the train page does: the engine's Shown (whole minutes toward
// zero) and format.ts's delayClass, not a second set of thresholds.
import { describe, expect, it } from "vitest";
import { emptyTimes, type Times } from "../src/core/models";
import { type BoardResult, Rail } from "../src/core/rail";
import { SimTransport } from "../src/core/simulator";
import { fromLondon } from "../src/core/time";
import { boardView } from "../src/ui/views/board";
import { MemStore, stations } from "./support";

const T0 = fromLondon(2026, 11, 7, 9, 0);
const NAV = { earlier: "#e", later: "#l", refresh: "#r", switch: "#s", all: "#a" };

const boards = new Map<string, Promise<BoardResult>>(); // one simulated board per mode: building one is slow
function board(mode: "dep" | "arr"): Promise<BoardResult> {
  if (!boards.has(mode)) boards.set(mode, new Rail(new SimTransport(() => T0), new MemStore(), stations, () => T0).board({ station: "PAD", mode }));
  return boards.get(mode)!;
}

/** The first row's live cell, with that row's arriving or departing times replaced. */
async function live(mode: "dep" | "arr", t: Partial<Times>): Promise<{ cls: string; text: string }> {
  const res = { ...(await board(mode)) };
  const r = res.rows[0];
  const times = { ...emptyTimes(), advertised: T0, internal: T0, ...t };
  res.rows = [mode === "arr" ? { ...r, arrival: times } : { ...r, departure: times }];
  const view = String(boardView(res, { station: "PAD", mode }, NAV, false, T0));
  const m = /<span class="trains__live tnum ([^"]*)">([\s\S]*?)<\/span><\/span>/.exec(view)!;
  const text = m[2].replace(/<span class="visually-hidden">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").trim(); // what's seen
  return { cls: m[1].trim(), text };
}

describe("a board row's live state", () => {
  it("an early arrival takes its class from delayClass", async () => {
    const s = await live("arr", { actual: T0 - 3 * 60_000 });
    expect(s.cls).toBe("is-early");
    expect(s.text).toBe("Arr 08:57");
  });

  it("a train 90 s late is 1 minute late, under the 2-minute line: not coloured late", async () => {
    const s = await live("dep", { forecast: T0 + 90_000 });
    expect(s.cls).toBe("is-ontime");
  });

  it("5 minutes late is very late, and says when it's expected", async () => {
    const s = await live("dep", { forecast: T0 + 5 * 60_000 });
    expect(s.cls).toBe("is-very-late");
    expect(s.text).toBe("Exp 09:05");
  });

  it("an early forecast says when, as the train page does", async () => {
    expect(await live("arr", { forecast: T0 - 2 * 60_000 })).toEqual({ cls: "is-early", text: "Exp 08:58" });
  });

  it("an on-time forecast says On time; no live time says No report, uncoloured", async () => {
    expect((await live("dep", { forecast: T0 + 30_000 })).text).toBe("On time");
    expect(await live("dep", {})).toEqual({ cls: "", text: "No report" });
  });
});
