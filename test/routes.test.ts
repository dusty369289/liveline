// Hash routes: each board has one URL, however it was reached (the search form, a board's own links, a saved journey).
import { describe, expect, it } from "vitest";
import { boardHash, parseHash, queryOf } from "../src/ui/routes";

const q = (hash: string) => queryOf(parseHash(hash).params);

describe("board queries", () => {
  it("normalise the mode once: anything but arr is departures", () => {
    expect(q("#/board?station=PAD&mode=arr").mode).toBe("arr");
    expect(q("#/board?station=PAD&mode=dep").mode).toBe("dep");
    expect(q("#/board?station=PAD").mode).toBe("dep");
    expect(q("#/board?station=PAD&mode=ARR").mode).toBe("dep");
  });

  it("a departures board's URL leaves the mode out, so it has one URL", () => {
    expect(boardHash(q("#/board?station=PAD&mode=dep"))).toBe("#/board?station=PAD");
    expect(boardHash(q("#/board?station=PAD&mode=arr&time=09%3A00"))).toBe("#/board?station=PAD&time=09%3A00&mode=arr");
  });

  it("round-trips: the URL of a board's query is that board's URL", () => {
    for (const h of ["#/board?station=PAD", "#/board?station=RDG&to=OXF&time=17%3A45&day=2026-11-07&mode=arr&all=1"]) {
      expect(boardHash(q(h))).toBe(h);
    }
  });

  it("extras come last, so Refresh is the board's URL plus refresh=1", () => {
    const query = q("#/board?station=PAD&to=OXF");
    expect(boardHash(query, { refresh: 1 })).toBe(`${boardHash(query)}&refresh=1`);
  });
});
