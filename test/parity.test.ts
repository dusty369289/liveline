// The core must keep giving the frozen golden answers (test/golden/README.md): parsed services and boards from real
// RTT recordings and spec fixtures, and the engine's timeline at many moments.
import { describe, expect, it } from "vitest";
import { build } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
import { stopSummary } from "../src/core/stops";
import { fromLondon } from "../src/core/time";
import { fixture, readJson } from "./support";

const cases = readJson<any>("golden/fixtures.json");
const plain = (o: unknown) => JSON.parse(JSON.stringify(o));

function timelineJson(tl: ReturnType<typeof build>) {
  const d = plain(tl);
  delete d.service;
  for (const v of d.points) delete v.point;
  return d;
}

/**
 * A train held at a platform past RTT's departure forecast came after the goldens (see their README): the old answer
 * kept showing that forecast, gone by then. Where the golden does, the new answer must be our time, no sooner than a
 * minute ago, in the departure and the headline; everything else still matches exactly.
 */
function heldSince(want: any, got: any, now: number) {
  const pos = want.position;
  const old = pos.state === "at-station" ? want.points[pos.fromIndex].departure : null;
  if (!old || old.source !== "forecast" || old.time >= now - 60_000) return want;
  const dep = got.points[pos.fromIndex].departure;
  expect(dep.source).toBe("est");
  expect(dep.time).toBeGreaterThanOrEqual(now - 60_000);
  const due = /due to leave \d\d:\d\d/;
  const points = want.points.map((v: any, i: number) => (i === pos.fromIndex ? { ...v, departure: dep } : v));
  return { ...want, points, position: { ...pos, headline: pos.headline.replace(due, got.position.headline.match(due)[0]) } };
}

describe("parity with the golden answers", () => {
  for (const c of cases) {
    if (c.kind === "service") {
      describe(c.file, () => {
        const svc = parseService(fixture(c.file));
        it("parses the same", () => expect(plain(svc)).toEqual(c.parsed));
        for (const t of c.timelines) {
          it(`timeline at ${new Date(t.now).toISOString()}`, () => {
            const tl = build(svc, t.now);
            expect(timelineJson(tl)).toEqual(heldSince(t.timeline, timelineJson(tl), t.now));
            for (const [key, want] of Object.entries(t.stops)) {
              const [code, off] = key.split(":");
              // timetableOnly came after the goldens (see their README): no golden moment is given up on
              const got = plain(stopSummary(tl, code, off !== "off")) ?? null;
              if (got) expect(got.timetableOnly).toBe(false);
              if (got) delete got.timetableOnly;
              expect(got).toEqual(want);
            }
          });
        }
      });
    } else {
      it(`${c.file} board parses the same`, () => {
        const t0 = fromLondon(2026, 1, 1);
        const board = parseBoard(fixture(c.file), { fallbackName: "Fallback", timeFrom: t0, timeTo: t0 + 3_600_000 });
        expect(plain(board)).toEqual(c.parsed);
      });
    }
  }
});
