// The board's platform plate: a changed platform says so in words as well as by its mark, whether or not the new
// platform is confirmed yet, as the train page's "Plat 3 changed" does.
import { describe, expect, it } from "vitest";
import { parseBoard } from "../src/core/parse";
import type { BoardResult } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { boardView } from "../src/ui/views/board";
import { fixture } from "./support";

const NOW = fromLondon(2026, 11, 7, 9, 20);
const NAV = { earlier: "#e", later: "#l", refresh: "#r", switch: "#s", all: "#a" };

function rendered(): Map<string, string> {
  const t0 = fromLondon(2026, 11, 7, 9, 15);
  const board = parseBoard(fixture("spec_location_platform_changed.json"),
    { fallbackName: "Reading", timeFrom: t0, timeTo: t0 + 3_600_000, today: () => NOW });
  const res: BoardResult = {
    board, rows: board.rows, station: undefined, mode: "dep", to: undefined, hidden: 0, showAll: false,
    fetched: { body: null, fetchedAt: NOW, stale: false, note: null },
  };
  const out = boardView(res, { station: "RDG" }, NAV, false, NOW).value;
  // One entry per row, by destination
  return new Map(out.split('<li class="trains__row').slice(1).map((li) => [li.match(/trains__place">([^<]+)</)![1], li]));
}

const plate = (li: string) => li.match(/class="trains__plat ([^"]*)"/)![1].split(/\s+/);
const meta = (li: string) => li.match(/trains__meta">([\s\S]*?)<\/span>/)![1];

describe("a changed platform on the board", () => {
  const rows = rendered();

  it("confirmed: the plate is marked changed and the row says so", () => {
    const li = rows.get("Bristol Temple Meads")!;
    expect(plate(li)).toContain("is-changed");
    expect(plate(li)).not.toContain("is-unconfirmed");
    expect(meta(li)).toContain("Platform changed");
  });

  it("only expected: both marks, and the words", () => {
    const li = rows.get("Manchester Piccadilly")!;
    expect(plate(li)).toEqual(expect.arrayContaining(["is-changed", "is-unconfirmed"]));
    expect(meta(li)).toContain("Platform changed");
  });

  it("unchanged platforms say nothing about it", () => {
    for (const dest of ["Abbey Wood", "London Waterloo"]) {
      expect(plate(rows.get(dest)!)).not.toContain("is-changed");
      expect(meta(rows.get(dest)!)).not.toContain("changed");
    }
  });
});
