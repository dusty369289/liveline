// Meeting a train: a train opened from an arrivals board is followed to where you are, not from it. Your station is
// where the train is met (you "get off" there, in the train page's terms), and the "from" station, if any, is where
// it was boarded. Before this, the link swapped them, and the big number counted down to the train leaving here.
import { describe, expect, it } from "vitest";
import { Rail } from "../src/core/rail";
import { yourStops } from "../src/core/stops";
import { fromLondon } from "../src/core/time";
import { boardView } from "../src/ui/views/board";
import { liveRegion } from "../src/ui/views/live-region";
import { MemStore, simulator, stations } from "./support";

const T0 = fromLondon(2026, 11, 7, 9, 0);
const NAV = { earlier: "#e", later: "#l", refresh: "#r", switch: "#s", all: "#a", change: "#c" };
const rail = new Rail(simulator(() => T0), new MemStore(), stations, () => T0);

/** Each row's train link on a drawn board, as the uid and its query. */
async function links(to: string | null): Promise<Array<{ uid: string; params: URLSearchParams }>> {
  const res = await rail.board({ station: "RDG", mode: "arr", to });
  const view = boardView(res, NAV, false, T0).value;
  return [...view.matchAll(/href="#\/train\/([^"?]+)(\?[^"]*)?"/g)]
    .map((m) => ({ uid: decodeURIComponent(m[1]), params: new URLSearchParams((m[2] ?? "").replaceAll("&amp;", "&")) }));
}

/** The first train in the list that has left Oxford and not yet reached Reading, with its stops and train page. */
async function through(list: Array<{ uid: string; params: URLSearchParams }>) {
  for (const l of list) {
    const at = l.params.get("at") ?? "";
    const to = l.params.get("to") ?? "";
    const svc = await rail.service(l.uid, { at, to });
    const tl = svc.timeline;
    const oxf = tl.points.find((v) => v.point.crs === "OXF");
    const rdg = tl.points.find((v) => v.point.crs === "RDG")!;
    if (oxf?.reported && !rdg.reported) return { l, svc, stops: yourStops(tl, at, to), rdg };
  }
  throw new Error("no train between Oxford and Reading on the board");
}

describe("a train opened from an arrivals board", () => {
  for (const from of ["OXF", null]) {
    describe(from ? "from Oxford" : "with no from station", () => {
      it(`gets on at ${from ?? "nowhere in particular"} and off here`, async () => {
        const list = await links(from);
        expect(list.length).toBeGreaterThan(0);
        for (const { params } of list) {
          expect(params.get("to")).toBe("RDG");
          expect(params.get("at")).toBe(from);
        }
      });

      it("counts down to it reaching Reading, timed from the arrival", async () => {
        const { svc, stops, rdg } = await through(await links(from));
        const [, off] = stops;
        expect(off?.name).toBe("Reading");
        const arrives = rdg.arrival!.time!;
        expect(arrives).not.toBe(rdg.departure!.time); // it stands at Reading, so leaving and reaching differ
        const out = liveRegion(svc, ...stops).value;
        expect(out).toMatch(/until it reaches Reading/);
        expect(out).toContain(`data-count-at="${arrives}"`);
        expect(out).not.toMatch(/until it leaves Reading/);
      });
    });
  }
});
