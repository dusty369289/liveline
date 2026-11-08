// The core must keep giving the frozen golden answers (test/golden/README.md): parsed services and boards from real
// RTT recordings and spec fixtures, and the engine's timeline at many moments.
import { describe, expect, it } from "vitest";
import { build, stopSummary } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
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

describe("parity with the golden answers", () => {
  for (const c of cases) {
    if (c.kind === "service") {
      describe(c.file, () => {
        const svc = parseService(fixture(c.file));
        it("parses the same", () => expect(plain(svc)).toEqual(c.parsed));
        for (const t of c.timelines) {
          it(`timeline at ${new Date(t.now).toISOString()}`, () => {
            const tl = build(svc, t.now);
            expect(timelineJson(tl)).toEqual(t.timeline);
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
