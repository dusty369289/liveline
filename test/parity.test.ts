// The TypeScript core must give exactly the Python reference's answers (scripts/export_golden.py writes them).
// Real RTT recordings and spec fixtures: parsed services and boards, and the engine's timeline at many moments.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build, stopSummary } from "../src/core/engine";
import { parseBoard, parseService } from "../src/core/parse";
import { fromLondon } from "../src/core/time";

const here = new URL(".", import.meta.url).pathname;
const cases = JSON.parse(readFileSync(`${here}golden/fixtures.json`, "utf8"));
const fixture = (name: string) => JSON.parse(readFileSync(`${here}fixtures/rtt/${name}`, "utf8"));
const plain = (o: unknown) => JSON.parse(JSON.stringify(o));

function timelineJson(tl: ReturnType<typeof build>) {
  const d = plain(tl);
  delete d.service;
  for (const v of d.points) delete v.point;
  return d;
}

describe("parity with the Python reference", () => {
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
              expect(plain(stopSummary(tl, code, off !== "off")) ?? null).toEqual(want);
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
