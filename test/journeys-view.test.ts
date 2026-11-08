// Saved journeys have a page of their own (owner, 2026-11-08: on the search page they were squished and, with many,
// took up the screen). The search page keeps one line to them, the same height however many there are.
import { describe, expect, it } from "vitest";
import { parseHash } from "../src/ui/routes";
import type { Journey } from "../src/ui/store/lists";
import { homeView } from "../src/ui/views/home";
import { journeysView } from "../src/ui/views/journeys";

const J = (from: string, fromName: string, to: string, toName: string): Journey => ({ from, fromName, to, toName });
const SAVED = [J("PAD", "London Paddington", "OXF", "Oxford"), J("RDG", "Reading", "PAD", "London Paddington"),
  J("WAT", "London Waterloo", "WOK", "Woking")];
const home = (journeys: Journey[]) => String(homeView({ query: {}, carry: null, journeys, now: 0 }));

describe("the search page", () => {
  it("has one line to the saved journeys, not the list", () => {
    const v = home(SAVED);
    expect(v).toContain('href="#/journeys"');
    expect(v).toContain("Saved journeys");
    expect(v).toContain("3 journeys");
    expect(v).not.toContain("Woking"); // the journeys themselves are on their page
  });

  it("with none saved, no line, and the tip on how to save one", () => {
    const v = home([]);
    expect(v).not.toContain("#/journeys");
    expect(v).toContain("save the journey");
  });
});

describe("the saved journeys page", () => {
  it("is a route of its own", () => {
    expect(parseHash("#/journeys").name).toBe("journeys");
  });

  it("lists each journey as one link to its board, with a bin to remove it, and no Return (owner: redundant)", () => {
    const v = String(journeysView(SAVED));
    expect(v).toContain('href="#/board?station=WAT&amp;to=WOK"');
    expect(v).not.toContain('href="#/board?station=WOK&amp;to=WAT"');
    expect(v).not.toContain("Return");
    expect(v).toContain('data-remove-journey="WAT WOK"');
    expect(v).toContain('aria-label="Remove London Waterloo to Woking"');
    expect(v).toContain("icon--bin");
  });

  it("with none saved, says how to save one", () => {
    const v = String(journeysView([]));
    expect(v).toContain("Calling at");
    expect(v).toContain('href="#/"');
  });
});
