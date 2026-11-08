// What a board row says, as text: what a screen reader reads and what the eye sees should carry the same facts
// (a changed or unconfirmed platform, where an arriving train comes from), not leave them to colour or an outline.
import { describe, expect, it } from "vitest";
import { parseBoard } from "../src/core/parse";
import type { BoardResult } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { boardView } from "../src/ui/views/board";
import { fixture } from "./support";

const T0 = fromLondon(2026, 7, 6, 15, 0);
const NAV = { earlier: "#e", later: "#l", refresh: "#r", switch: "#s", all: "#a" };

function board(mode: "dep" | "arr"): BoardResult {
  const b = parseBoard(fixture("spec_location_platform_changed.json"), { fallbackName: "Reading", timeFrom: T0, timeTo: T0 + 3_600_000, today: () => T0 });
  return { board: b, rows: b.rows, station: undefined, fetched: { body: null, fetchedAt: T0, stale: false, note: null }, mode, to: undefined, hidden: 0, showAll: false };
}

/** Each row's text as a screen reader meets it: aria-hidden parts dropped, tags removed, spaces squeezed. */
function rows(res: BoardResult): string[] {
  const out = boardView(res, {}, NAV, false, T0).value;
  return [...out.matchAll(/<li class="trains__row[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]
    .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

describe("a board row", () => {
  it("says a changed platform in words, not only in colour", () => {
    expect(rows(board("dep"))[0]).toMatch(/Platform 5, changed/);
  });

  it("says an unconfirmed platform in words, not only as an outline", () => {
    expect(rows(board("dep"))[1]).toMatch(/Platform 7, not confirmed/);
  });

  it("names a confirmed, unchanged platform plainly", () => {
    const res = board("dep");
    res.rows = [{ ...res.rows[0], platformChanged: false }];
    expect(rows(res)[0]).toMatch(/Platform 5$/);
  });

  it("on arrivals, says where the train comes from", () => {
    const [oxford, basingstoke] = rows(board("arr"));
    expect(oxford).toContain("from Oxford");
    expect(basingstoke).toContain("from Basingstoke");
  });

  it("on departures, names only where it's going", () => {
    expect(rows(board("dep"))[0]).not.toContain("from ");
  });
});
