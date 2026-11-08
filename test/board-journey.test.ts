// @vitest-environment happy-dom
// The star on a board saves the journey you'd make: on departures from here to the other station, on arrivals from
// the other station to here. "Arrivals at Paddington from Oxford" is the trip Oxford to Paddington, the same journey
// the departures board at Oxford calling at Paddington shows, so starring either lights the other.
import { beforeEach, describe, expect, it } from "vitest";
import { Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { fragment } from "../src/ui/html";
import { BoardPage } from "../src/ui/pages/board";
import type { AppContext } from "../src/ui/pages/page";
import { parseHash } from "../src/ui/routes";
import { Journeys } from "../src/ui/store/lists";
import { MemStore, simulator, stations } from "./support";

const T0 = fromLondon(2026, 11, 7, 9, 0);

beforeEach(() => localStorage.clear());

/** A board page drawn into the document and wired, as the app does it. */
async function open(hash: string, journeys: Journeys): Promise<HTMLElement> {
  const rail = new Rail(simulator(() => T0), new MemStore(), stations, () => T0);
  const ctx = { rail, stations: { remember() {} }, journeys } as unknown as AppContext;
  const page = new BoardPage(ctx, parseHash(hash));
  const markup = await page.load(() => false);
  const root = document.createElement("div");
  root.append(fragment(markup!));
  page.mount(root);
  return root;
}

const star = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("[data-save-journey]")!;

describe("saving a journey from a board", () => {
  it("on arrivals, saves the trip from the other station to here", async () => {
    const journeys = new Journeys();
    star(await open("#/board?station=PAD&to=OXF&mode=arr", journeys)).click();
    expect(journeys.all()).toEqual([{ from: "OXF", fromName: "Oxford", to: "PAD", toName: "London Paddington" }]);
  });

  it("the same trip is starred on the departures board it belongs to", async () => {
    const journeys = new Journeys();
    star(await open("#/board?station=PAD&to=OXF&mode=arr", journeys)).click();
    expect(star(await open("#/board?station=OXF&to=PAD", journeys)).getAttribute("aria-pressed")).toBe("true");
  });

  it("on departures, saves the trip from here to the other station", async () => {
    const journeys = new Journeys();
    star(await open("#/board?station=OXF&to=PAD", journeys)).click();
    expect(journeys.all()).toEqual([{ from: "OXF", fromName: "Oxford", to: "PAD", toName: "London Paddington" }]);
  });
});
