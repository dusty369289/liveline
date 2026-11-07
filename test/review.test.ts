// The test review harness itself: slow tests queue and stay queued, a slow machine isn't blamed on one test,
// failed-then-passed on the same code is flaky, and acceptances need a reason.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FINGERPRINT_ROOTS, LIMITS, type TestRun, TestReview } from "./harness/review";

let dir: string;
let review: TestReview;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "liveline-review-"));
  review = new TestReview(dir, () => new Date("2026-11-07T12:00:00Z"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const passed = (id: string, ms: number): TestRun => ({ id, state: "passed", ms });
/** Five steady tests so the machine-speed vote has enough to go on, plus whatever a test adds. */
const steady = (scale = 1) => ["a", "b", "c", "d", "e"].map((x) => passed(`steady ${x}`, 200 * scale));

describe("timing review", () => {
  it("queues a test that gets clearly slower, and keeps it queued until it recovers", () => {
    for (let i = 0; i < 3; i++) review.record([...steady(), passed("t", 100)], "fp");
    const slow = review.record([...steady(), passed("t", 400)], "fp");
    expect(slow.newlySlow).toEqual(["t"]);
    expect(review.record([...steady(), passed("t", 400)], "fp").newlySlow).toEqual([]); // already queued: not new
    expect(review.pending().queue.map(([id]) => id)).toEqual(["t"]);
    for (let i = 0; i < LIMITS.recoverRuns - 1; i++) review.record([...steady(), passed("t", 100)], "fp");
    expect(review.pending().queue.length).toBe(1); // not yet: three good runs in a row
    review.record([...steady(), passed("t", 100)], "fp");
    expect(review.pending().queue.length).toBe(0);
  });

  it("doesn't blame one test when the whole machine is slower", () => {
    for (let i = 0; i < 3; i++) review.record([...steady(), passed("t", 100)], "fp");
    const r = review.record([...steady(3), passed("t", 300)], "fp");
    expect(r.machine).toBeCloseTo(3);
    expect(r.newlySlow).toEqual([]);
  });

  it("ignores jitter on tiny tests", () => {
    for (let i = 0; i < 3; i++) review.record([...steady(), passed("tiny", 35)], "fp");
    expect(review.record([...steady(), passed("tiny", 120)], "fp").newlySlow).toEqual([]); // 3.4x, but only 85 ms
  });

  it("accepting a new time needs a reason and is logged", () => {
    for (let i = 0; i < 3; i++) review.record([...steady(), passed("t", 100)], "fp");
    review.record([...steady(), passed("t", 500)], "fp");
    expect(review.accept("t", "  ")).toBe(false);
    expect(review.accept("t", "now builds a three-hour board")).toBe(true);
    expect(review.pending().queue.length).toBe(0);
    expect(readFileSync(join(dir, "accepted.log"), "utf8")).toContain("timing t: 100 -> 500 ms. now builds a three-hour board");
    expect(review.record([...steady(), passed("t", 520)], "fp").newlySlow).toEqual([]); // the new normal
  });
});

describe("flaky review", () => {
  it("failed then passed on the same code is flaky, and stays listed until explained", () => {
    review.record([{ id: "f", state: "failed", ms: 10, error: "boom" }], "same");
    const r = review.record([passed("f", 10)], "same");
    expect(r.newlyFlaky).toEqual(["f"]);
    review.record([passed("f", 10)], "same");
    expect(review.pending().flaky.map(([id]) => id)).toEqual(["f"]);
    expect(review.explain("f", "")).toBe(false);
    expect(review.explain("f", "the clock wasn't installed before the page loaded; fixed in support.ts")).toBe(true);
    expect(review.pending().flaky).toEqual([]);
  });

  it("the fingerprint covers what the tests read beyond src/: CSS and the Android files", () => {
    for (const r of ["public/css", "android/app/build.gradle", "capacitor.config.ts"]) expect(FINGERPRINT_ROOTS).toContain(r);
  });

  it("failed then passed after a code change is a fix, not flaky", () => {
    review.record([{ id: "f", state: "failed", ms: 10 }], "before");
    expect(review.record([passed("f", 10)], "after").newlyFlaky).toEqual([]);
  });

  it("keeps every failure's message", () => {
    review.record([{ id: "f", state: "failed", ms: 10, error: "expected 3 to be 4" }], "fp");
    expect(readFileSync(join(dir, "failures.log"), "utf8")).toContain("f\nexpected 3 to be 4");
  });
});

describe("on CI", () => {
  it("keeps no baselines (its machines are thrown away) but still reports the slowest", () => {
    const r = review.record([passed("t", 900), passed("u", 10)], "fp", true);
    expect(r.slowest[0].id).toBe("t");
    expect(review.pending().queue).toEqual([]);
    expect(TestReview.report(r, true)).toEqual(["Slowest: 900 ms t; 10 ms u"]);
  });
});
