// The test review harness itself: slow tests queue and stay queued, a slow machine isn't blamed on one test,
// failed-then-passed on the same code is flaky, and acceptances need a reason.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FINGERPRINT_ROOTS, fingerprint, LIMITS, type TestRun, TestReview } from "./harness/review";
import { toRun } from "./harness/review-playwright";

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

  it("ignores a small test slowed by its neighbours in a parallel run", () => {
    // 2026-11-08: whole files of 10 ms tests ran at about 250 ms beside the tests that spawn git and sh, and went on the
    // queue every run, a different file each time: noise, not a regression
    for (let i = 0; i < 3; i++) review.record([...steady(), passed("small", 30)], "fp");
    expect(review.record([...steady(), passed("small", 270)], "fp").newlySlow).toEqual([]);
  });

  it("a fast test that suddenly takes far longer is queued, not taken as its new normal", () => {
    for (let i = 0; i < 3; i++) review.record([...steady(), passed("tiny", 5)], "fp");
    expect(review.record([...steady(), passed("tiny", 900)], "fp").newlySlow).toEqual(["tiny"]);
  });

  it("tests under the timing floor don't vote on how slow the machine is", () => {
    const tiny = ["p", "q", "r", "s", "u", "v", "w"].map((x) => passed(`tiny ${x}`, 1));
    for (let i = 0; i < 3; i++) review.record([...steady(), ...tiny, passed("t", 100)], "fp");
    // the whole machine is 3x slower; seven 1 ms tests still at 1 ms would otherwise outvote that and blame "t"
    const r = review.record([...steady(3), ...tiny, passed("t", 300)], "fp");
    expect(r.machine).toBeCloseTo(3);
    expect(r.newlySlow).toEqual([]);
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

  it("the fingerprint covers what the tests read beyond src/: CSS, the Android files, the scripts and workflows", () => {
    for (const r of ["public/css", "android/app/build.gradle", "capacitor.config.ts", "scripts", ".github",
      "android/gradle/wrapper/gradle-wrapper.properties", "android/app/src/test", "android/app/src/androidTest",
      "android/app/src/main/java", "index.html", "playwright.config.ts"]) {
      expect(FINGERPRINT_ROOTS).toContain(r);
    }
  });

  it("the fingerprint sees a change to any file, a hook with no extension included", () => {
    const root = mkdtempSync(join(tmpdir(), "fp-"));
    writeFileSync(join(root, "pre-push"), "exit 1\n");
    const before = fingerprint([root]);
    writeFileSync(join(root, "pre-push"), "exit 0\n");
    expect(fingerprint([root])).not.toBe(before);
    rmSync(root, { recursive: true, force: true });
  });

  it("failed then passed after a code change is a fix, not flaky", () => {
    review.record([{ id: "f", state: "failed", ms: 10 }], "before");
    expect(review.record([passed("f", 10)], "after").newlyFlaky).toEqual([]);
  });

  it("keeps every failure's message", () => {
    review.record([{ id: "f", state: "failed", ms: 10, error: "expected 3 to be 4" }], "fp");
    expect(readFileSync(join(dir, "failures.log"), "utf8")).toContain("f\nexpected 3 to be 4");
  });

  it("keeps its state where TEST_REVIEW_DIR says (pre-commit's snapshot points it back at the real checkout)", () => {
    const was = process.env.TEST_REVIEW_DIR; // set for real while pre-commit checks a snapshot
    process.env.TEST_REVIEW_DIR = dir;
    try {
      new TestReview().record([{ id: "f", state: "failed", ms: 10, error: "boom" }], "fp");
    } finally {
      if (was === undefined) delete process.env.TEST_REVIEW_DIR;
      else process.env.TEST_REVIEW_DIR = was;
    }
    expect(readFileSync(join(dir, "failures.log"), "utf8")).toContain("f\nboom");
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

describe("browser tests", () => {
  const FOLDS = "test/ui/flows.spec.ts > phone-360-light > train page > folds";
  type Status = "passed" | "failed" | "timedOut" | "interrupted" | "skipped";
  /** Just the parts of Playwright's TestCase and TestResult that toRun reads. */
  const pw = (status: Status, ms: number, stack?: string) => toRun(
    { titlePath: () => ["", "phone-360-light", "flows.spec.ts", "train page", "folds"],
      location: { file: join(process.cwd(), "test/ui/flows.spec.ts") },
      parent: { project: () => ({ name: "phone-360-light" }) } },
    { status, duration: ms, errors: stack ? [{ stack }] : [] });

  it("names a run by file, project and title, and counts a timeout or an interruption as a failure", () => {
    expect(pw("passed", 900)).toEqual({ id: FOLDS, state: "passed", ms: 900, error: undefined });
    expect(pw("timedOut", 10_000, "Test timeout of 10000ms exceeded")).toMatchObject({ state: "failed",
      error: "Test timeout of 10000ms exceeded" });
    expect(pw("interrupted", 10).state).toBe("failed");
    expect(pw("skipped", 0).state).toBe("skipped");
  });

  it("a failure is logged, a fail then a pass on the same code is flaky, and the unit tests' baselines stay", () => {
    const unit = "test/poll.test.ts > t";
    for (let i = 0; i < 3; i++) review.record([...steady(), passed(unit, 100)], "fp");
    review.record([pw("failed", 3000, "expected aria-expanded false")], "fp");
    expect(readFileSync(join(dir, "failures.log"), "utf8")).toContain(`${FOLDS}\nexpected aria-expanded false`);
    expect(review.record([pw("passed", 3000)], "fp").newlyFlaky).toEqual([FOLDS]);
    const timings = JSON.parse(readFileSync(join(dir, "timings.json"), "utf8"));
    expect(Object.keys(timings)).toEqual(expect.arrayContaining([unit, "steady a", FOLDS]));
    // the unit test's baseline survived the browser runs, so it still notices that test slowing down
    expect(review.record([...steady(), passed(unit, 400)], "fp").newlySlow).toEqual([unit]);
  });
});
