// Test review state, kept between runs in .test-review/ (gitignored, per machine). Used by the Vitest reporter
// (review-reporter.ts) and the command line (scripts/review.mjs, `npm run review`).
//
// - Timing: each test has a baseline (median of its recent passing runs). A run clearly slower than that, after
//   allowing for the whole machine being slower today, enters a sticky queue shown on every run until the test is back
//   within limits three runs in a row, or someone accepts the new time with a reason. Warnings never fail a run.
// - Flaky: a test that failed and then passed on exactly the same code is flaky. It's listed on every run until
//   someone explains it. Never re-run until green and move on.
// - Failures: every failing test's message is appended to failures.log, so the real error is never lost.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LIMITS = {
  slowFactor: 2, // slower than twice its baseline...
  slowMs: 100, // ...and by at least this much (tiny tests jitter by more than 2x)
  minMs: 30, // tests faster than this are never timed
  recoverRuns: 3, // back within limits this many runs in a row: off the queue
  history: 7, // passing runs kept for the median
  machineSlow: 1.3, // the whole run this much slower: say so, and scale for it
};

export interface TestRun {
  id: string; // "test/poll.test.ts > polling a train > stops only once it has arrived"
  state: "passed" | "failed" | "skipped";
  ms: number;
  error?: string;
}
export interface Queued { baseline: number; seen: number; since: string; good: number }
export interface Flaky { since: string; fp: string }
interface Timing { history: number[]; baseline: number }
interface Outcome { fp: string; state: TestRun["state"] }

export interface RunSummary {
  machine: number; // how much slower than usual the whole run was (1 = normal)
  newlySlow: string[];
  queue: Array<[string, Queued]>;
  flaky: Array<[string, Flaky]>;
  newlyFlaky: string[];
  slowest: TestRun[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Everything the tests read, so "failed then passed" only counts as flaky when none of it changed. It must cover the
 * CSS, the Android files and the scripts (the git hooks are tested) too: a test that reads them fails when they break
 * and passes when they're fixed, which is a fix, not a flake. Every file under a root counts, whatever its extension.
 */
export const FINGERPRINT_ROOTS = ["src", "test", "public/css", "scripts", "android/app/build.gradle",
  "android/app/src/main/AndroidManifest.xml", "capacitor.config.ts", "vite.config.ts", "package.json"];

export function fingerprint(roots = FINGERPRINT_ROOTS): string {
  const h = createHash("sha256");
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) for (const name of readdirSync(p).sort()) walk(join(p, name));
    else h.update(p).update(readFileSync(p));
  };
  for (const r of roots) if (existsSync(r)) walk(r);
  return h.digest("hex").slice(0, 16);
}

export class TestReview {
  // plain fields, not parameter properties: `npm run review` runs this file with Node's type stripping
  private readonly dir: string;
  private readonly clock: () => Date;

  constructor(dir = ".test-review", clock: () => Date = () => new Date()) {
    this.dir = dir;
    this.clock = clock;
  }

  private read<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(join(this.dir, name), "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  private write(name: string, v: unknown): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, name), `${JSON.stringify(v, null, 1)}\n`);
  }

  private log(name: string, text: string): void {
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(join(this.dir, name), text);
  }

  /** Record one run. `ci`: a throwaway machine, so no baselines are kept or compared (failures are still logged). */
  record(runs: TestRun[], fp: string, ci = false): RunSummary {
    const now = this.clock().toISOString();
    const failed = runs.filter((r) => r.state === "failed");
    if (failed.length) this.log("failures.log", failed.map((f) => `=== ${now} ${f.id}\n${f.error ?? "(no message)"}\n`).join("\n") + "\n");
    const slowest = runs.filter((r) => r.state === "passed").sort((a, b) => b.ms - a.ms).slice(0, 5);
    if (ci) return { machine: 1, newlySlow: [], queue: [], flaky: [], newlyFlaky: [], slowest };

    const outcomes = this.read<Record<string, Outcome>>("outcomes.json", {});
    const flaky = this.read<Record<string, Flaky>>("flaky.json", {});
    const newlyFlaky: string[] = [];
    for (const r of runs) {
      const before = outcomes[r.id];
      if (before && before.fp === fp && before.state === "failed" && r.state === "passed" && !flaky[r.id]) {
        flaky[r.id] = { since: now, fp };
        newlyFlaky.push(r.id);
      }
      if (r.state !== "skipped") outcomes[r.id] = { fp, state: r.state };
    }

    const timings = this.read<Record<string, Timing>>("timings.json", {});
    const queue = this.read<Record<string, Queued>>("timing-queue.json", {});
    const timed = runs.filter((r) => r.state === "passed" && r.ms >= LIMITS.minMs);
    const ratios = timed.filter((r) => timings[r.id]?.baseline).map((r) => r.ms / timings[r.id].baseline);
    const machine = ratios.length >= 5 ? Math.max(1, median(ratios)) : 1;
    const newlySlow: string[] = [];
    for (const r of timed) {
      const t = timings[r.id];
      if (!t) {
        timings[r.id] = { history: [r.ms], baseline: r.ms };
        continue;
      }
      const adjusted = r.ms / machine;
      if (adjusted > t.baseline * LIMITS.slowFactor && adjusted - t.baseline > LIMITS.slowMs) {
        if (!queue[r.id]) newlySlow.push(r.id);
        queue[r.id] = { baseline: t.baseline, seen: Math.round(r.ms), since: queue[r.id]?.since ?? now, good: 0 };
        continue; // a slow run never moves its own baseline
      }
      if (queue[r.id] && ++queue[r.id].good >= LIMITS.recoverRuns) delete queue[r.id];
      t.history = [...t.history, r.ms].slice(-LIMITS.history);
      t.baseline = median(t.history);
    }
    this.write("outcomes.json", outcomes);
    this.write("flaky.json", flaky);
    this.write("timings.json", timings);
    this.write("timing-queue.json", queue);
    return { machine, newlySlow, queue: Object.entries(queue), flaky: Object.entries(flaky), newlyFlaky, slowest };
  }

  /** Take a queued test's new time as normal, saying why. */
  accept(id: string, reason: string): boolean {
    const queue = this.read<Record<string, Queued>>("timing-queue.json", {});
    const q = queue[id];
    if (!q || !reason.trim()) return false;
    const timings = this.read<Record<string, Timing>>("timings.json", {});
    timings[id] = { history: [q.seen], baseline: q.seen };
    delete queue[id];
    this.write("timings.json", timings);
    this.write("timing-queue.json", queue);
    this.log("accepted.log", `${this.clock().toISOString()} timing ${id}: ${Math.round(q.baseline)} -> ${q.seen} ms. ${reason}\n`);
    return true;
  }

  /** Say why a flaky test was flaky and what was done, which takes it off the list. */
  explain(id: string, reason: string): boolean {
    const flaky = this.read<Record<string, Flaky>>("flaky.json", {});
    if (!flaky[id] || !reason.trim()) return false;
    delete flaky[id];
    this.write("flaky.json", flaky);
    this.log("accepted.log", `${this.clock().toISOString()} flaky ${id}: ${reason}\n`);
    return true;
  }

  pending(): { queue: Array<[string, Queued]>; flaky: Array<[string, Flaky]> } {
    return {
      queue: Object.entries(this.read<Record<string, Queued>>("timing-queue.json", {})),
      flaky: Object.entries(this.read<Record<string, Flaky>>("flaky.json", {})),
    };
  }

  /** The lines printed after every run. */
  static report(r: RunSummary, ci: boolean): string[] {
    const out = [`Slowest: ${r.slowest.map((s) => `${Math.round(s.ms)} ms ${s.id.split(" > ").slice(-1)[0]}`).join("; ")}`];
    if (ci) return out;
    if (r.machine > LIMITS.machineSlow) out.push(`This machine ran ${r.machine.toFixed(1)}x slower than usual overall; timings were scaled for that.`);
    for (const [id, q] of r.queue) {
      out.push(`SLOW${r.newlySlow.includes(id) ? " (new)" : ""}: ${id}: ${q.seen} ms, usually ${Math.round(q.baseline)} ms. `
        + `Explain it, then: npm run review -- accept "${id}" --reason "..."`);
    }
    for (const [id] of r.flaky) {
      out.push(`FLAKY${r.newlyFlaky.includes(id) ? " (new)" : ""}: ${id}: failed then passed on the same code. `
        + `Investigate, then: npm run review -- explain "${id}" --reason "..."`);
    }
    if (!r.queue.length && !r.flaky.length) out.push("Test review: no slow or flaky tests.");
    return out;
  }
}
