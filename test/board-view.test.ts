// A board row's live state reads its lateness the way the train page does: the engine's Shown (whole minutes toward
// zero) and format.ts's delayClass, not a second set of thresholds. And what a board row says, as text: what a screen
// reader reads and what the eye sees should carry the same facts (a changed or unconfirmed platform, where an arriving
// train comes from), not leave them to colour or an outline.
import { describe, expect, it } from "vitest";
import { emptyTimes, type Times } from "../src/core/models";
import { parseBoard } from "../src/core/parse";
import { type BoardResult, Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { boardView } from "../src/ui/views/board";
import { fixture, MemStore, simulator, stations } from "./support";

const T0 = fromLondon(2026, 11, 7, 9, 0);
const NAV = { earlier: "#e", later: "#l", refresh: "#r", switch: "#s", all: "#a", change: "#c", flip: null };

const boards = new Map<string, Promise<BoardResult>>(); // one simulated board per mode: building one is slow
function board(mode: "dep" | "arr"): Promise<BoardResult> {
  if (!boards.has(mode)) boards.set(mode, new Rail(simulator(() => T0), new MemStore(), stations, () => T0).board({ station: "PAD", mode }));
  return boards.get(mode)!;
}

/**
 * The first row's live cell, with that row's arriving or departing times replaced (booked at T0), drawn at `now`,
 * as a bus if `bus`.
 */
async function live(mode: "dep" | "arr", t: Partial<Times>, now = T0, bus = false): Promise<{ cls: string; text: string }> {
  const res = { ...(await board(mode)) };
  const r = { ...res.rows[0], ...(bus ? { mode: "BUS" } : {}) };
  const times = { ...emptyTimes(), advertised: T0, internal: T0, ...t };
  res.rows = [mode === "arr" ? { ...r, arrival: times } : { ...r, departure: times }];
  const view = String(boardView(res, NAV, false, now));
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

  it("an on-time forecast says On time", async () => {
    expect((await live("dep", { forecast: T0 + 30_000 })).text).toBe("On time");
  });
});

// No live time isn't a fault until the train should have been reported: before then it's simply the timetable.
describe("a board row with no live time", () => {
  it("at its booked time says Timetable, uncoloured", async () => {
    expect(await live("dep", {})).toEqual({ cls: "", text: "Timetable" });
  });

  it("30 minutes ahead says Timetable", async () => {
    expect(await live("dep", {}, T0 - 30 * 60_000)).toEqual({ cls: "", text: "Timetable" });
  });

  it("still Timetable 2 minutes past booked, a report can lag that much", async () => {
    expect((await live("arr", {}, T0 + 2 * 60_000)).text).toBe("Timetable");
  });

  it("5 minutes past booked says No report, uncoloured", async () => {
    expect(await live("dep", {}, T0 + 5 * 60_000)).toEqual({ cls: "", text: "No report" });
    expect((await live("arr", {}, T0 + 5 * 60_000)).text).toBe("No report");
  });

  it("a bus says neither: buses aren't reported, and the row already says Bus", async () => {
    expect(await live("dep", {}, T0 - 30 * 60_000, true)).toEqual({ cls: "", text: "" });
    expect(await live("dep", {}, T0 + 5 * 60_000, true)).toEqual({ cls: "", text: "" });
  });

  it("a bus with a live time still shows it", async () => {
    expect((await live("dep", { forecast: T0 + 5 * 60_000 }, T0, true)).text).toBe("Exp 09:05");
  });
});

const T1 = fromLondon(2026, 7, 6, 15, 0); // the platform-changed recording's afternoon

function platformBoard(mode: "dep" | "arr"): BoardResult {
  const b = parseBoard(fixture("spec_location_platform_changed.json"), { fallbackName: "Reading", timeFrom: T1, timeTo: T1 + 3_600_000, today: () => T1 });
  return { board: b, rows: b.rows, station: undefined, fetched: { body: null, fetchedAt: T1, stale: false, note: null }, mode, to: undefined, hidden: 0, showAll: false, next: b.timeTo };
}

/** Each row's text as a screen reader meets it: aria-hidden parts dropped, tags removed, spaces squeezed. */
function rows(res: BoardResult): string[] {
  const out = boardView(res, NAV, false, T1).value;
  return [...out.matchAll(/<li class="trains__row[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]
    .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

describe("a board row", () => {
  it("says a changed platform in words, not only in colour", () => {
    expect(rows(platformBoard("dep"))[0]).toMatch(/Platform 5, changed/);
  });

  it("says an unconfirmed platform in words, not only as an outline", () => {
    expect(rows(platformBoard("dep"))[1]).toMatch(/Platform 7, not confirmed/);
  });

  it("names a confirmed, unchanged platform plainly", () => {
    const res = platformBoard("dep");
    res.rows = [{ ...res.rows[0], platformChanged: false }];
    expect(rows(res)[0]).toMatch(/Platform 5$/);
  });

  it("on arrivals, says where the train comes from", () => {
    const [oxford, basingstoke] = rows(platformBoard("arr"));
    expect(oxford).toContain("from Oxford");
    expect(basingstoke).toContain("from Basingstoke");
  });

  it("on departures, names only where it's going", () => {
    expect(rows(platformBoard("dep"))[0]).not.toContain("from ");
  });
});

// The board's platform plate: a changed platform says so in words as well as by its mark, whether or not the new
// platform is confirmed yet, as the train page's "Plat 3 changed" does.
const NOW = fromLondon(2026, 11, 7, 9, 20);

function rendered(): Map<string, string> {
  const t0 = fromLondon(2026, 11, 7, 9, 15);
  const board = parseBoard(fixture("spec_location_platform_states.json"),
    { fallbackName: "Reading", timeFrom: t0, timeTo: t0 + 3_600_000, today: () => NOW });
  const res: BoardResult = {
    board, rows: board.rows, station: undefined, mode: "dep", to: undefined, hidden: 0, showAll: false, next: board.timeTo,
    fetched: { body: null, fetchedAt: NOW, stale: false, note: null },
  };
  const out = boardView(res, NAV, false, NOW).value;
  // One entry per row, by destination
  return new Map(out.split('<li class="trains__row').slice(1).map((li) => [li.match(/trains__place">([^<]+)</)![1], li]));
}

const plate = (li: string) => li.match(/class="trains__plat ([^"]*)"/)![1].split(/\s+/);
// The line under the destination, up to the plate after it (it holds spans of its own: the operator's badge and name)
const meta = (li: string) => li.match(/trains__meta">([\s\S]*?)<span class="trains__plat/)![1];

describe("a row's operator", () => {
  const all = rendered();

  it("has its badge and its full name, which the Operator colour theme leaves to screen readers", () => {
    const li = all.get("Abbey Wood")!; // the Elizabeth line, XR
    expect(meta(li)).toMatch(/<span class="trains__op" data-op="XR" aria-hidden="true">Elizabeth line<\/span><span class="trains__opname">[^<]+<\/span>/);
  });
});

describe("a changed platform on the board", () => {
  const all = rendered();

  it("confirmed: the plate is marked changed and the row says so", () => {
    const li = all.get("Bristol Temple Meads")!;
    expect(plate(li)).toContain("is-changed");
    expect(plate(li)).not.toContain("is-unconfirmed");
    expect(meta(li)).toMatch(/Platform\schanged/);
  });

  it("only expected: both marks, and the words", () => {
    const li = all.get("Manchester Piccadilly")!;
    expect(plate(li)).toEqual(expect.arrayContaining(["is-changed", "is-unconfirmed"]));
    expect(meta(li)).toMatch(/Platform\schanged/);
  });

  it("unchanged platforms say nothing about it", () => {
    for (const dest of ["Abbey Wood", "London Waterloo"]) {
      expect(plate(all.get(dest)!)).not.toContain("is-changed");
      expect(meta(all.get(dest)!)).not.toContain("changed");
    }
  });
});
