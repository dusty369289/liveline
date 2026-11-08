// Playwright reporter: the browser suite feeds the same test review as the unit tests (review.ts), so a browser test
// that fails then passes on the same code is listed as flaky, its error is kept in failures.log, and its time is
// watched. Without it, "never re-run until green" would depend on someone remembering the failure.
import { relative } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { fingerprint, type TestRun, TestReview } from "./review";

type Case = { titlePath(): string[]; location: { file: string }; parent: { project(): { name: string } | undefined } };
type Result = { status: TestResult["status"]; duration: number; errors: Array<{ stack?: string; message?: string }> };

/** One browser test's run, named `file > project > describe > title`. A timeout or an interruption is a failure. */
export function toRun(test: Case, result: Result): TestRun {
  const project = test.parent.project()?.name ?? "";
  const file = relative(process.cwd(), test.location.file).split("\\").join("/");
  // titlePath() is ["", project, file name, ...describes, title]: keep the describes and the title
  const titles = test.titlePath().slice(3);
  const state = result.status === "passed" ? "passed" : result.status === "skipped" ? "skipped" : "failed";
  const error = state === "failed" ? result.errors.map((e) => e.stack ?? e.message ?? "").join("\n") || undefined : undefined;
  return { id: [file, project, ...titles].join(" > "), state, ms: result.duration, error };
}

export default class ReviewPlaywright implements Reporter {
  private readonly runs: TestRun[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.runs.push(toRun(test, result));
  }

  onEnd(result: FullResult): void {
    if (result.status === "interrupted") return; // a run stopped part way says nothing reliable about the rest
    const ci = !!process.env.CI;
    console.log(`\n${TestReview.report(new TestReview().record(this.runs, fingerprint(), ci), ci).join("\n")}\n`);
  }
}
