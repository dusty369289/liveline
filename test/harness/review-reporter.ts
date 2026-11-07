// Vitest reporter: after every run, record outcomes and timings and print what needs a person (review.ts).
import type { Reporter, TestModule } from "vitest/node";
import { fingerprint, type TestRun, TestReview } from "./review";

export default class ReviewReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const runs: TestRun[] = [];
    for (const m of modules) {
      for (const t of m.children.allTests()) {
        const res = t.result();
        const state = res.state === "passed" ? "passed" : res.state === "failed" ? "failed" : "skipped";
        const error = res.state === "failed" ? res.errors?.map((e) => e.stack ?? e.message).join("\n") : undefined;
        runs.push({ id: `${m.relativeModuleId} > ${t.fullName}`, state, ms: t.diagnostic()?.duration ?? 0, error });
      }
    }
    const ci = !!process.env.CI;
    console.log(`\n${TestReview.report(new TestReview().record(runs, fingerprint(), ci), ci).join("\n")}\n`);
  }
}
