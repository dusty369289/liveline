// scripts/merge-pr.sh (npm run merge) with a stand-in `gh`, so no network: it merges only when both required checks
// passed on the PR's head and the PR's text is clean, and it always says why when it refuses. Process work is labelled
// "process" before it merges, so release notes leave it out.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { script, TempRepo } from "./repo-support";

let repo: TempRepo;
// The stand-in answers the questions merge-pr.sh asks, from the environment, and logs a label or merge to merged.log
const GH = `#!/bin/sh
case "$*" in
  *headRefOid*) echo abc123 ;;
  *headRefName*) echo "$STUB_BRANCH" ;;
  *"label create"*) ;;
  *"pr edit"*) echo "$*" >> "$STUB_LOG" ;;
  *"pr checks"*) printf '%b' "$STUB_CHECKS"; exit "\${STUB_CHECKS_EXIT:-0}" ;;
  *"--jq .title"*) printf '%s\\n' "$STUB_TITLE" ;;
  *"--jq .body"*) printf '%s\\n' "$STUB_BODY" ;;
  *"pr merge"*) echo "$*" >> "$STUB_LOG" ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`;

beforeEach(() => {
  repo = new TempRepo();
  repo.write(".git/stub-bin/gh", GH, true);
  Object.assign(repo.env, {
    PATH: `${repo.dir}/.git/stub-bin:${repo.env.PATH}`, STUB_LOG: `${repo.dir}/.git/merged.log`,
    STUB_CHECKS: "Checks=SUCCESS\\nBrowser=SUCCESS\\n", STUB_TITLE: "Board shows late trains", STUB_BODY: "What changed.",
    STUB_BRANCH: "fix/board-late-trains",
  });
});
afterEach(() => repo.remove());

const merge = () => repo.run("sh", [script("merge-pr.sh"), "42"]);
const merged = () => repo.run("cat", [".git/merged.log"]).stdout;

describe("npm run merge", () => {
  it("merges, pinned to the head it checked, when both required checks passed and the text is clean", () => {
    const run = merge();
    expect(run.status, run.stderr).toBe(0);
    expect(merged()).toContain("--match-head-commit abc123");
  });

  it("refuses when a required check is missing, even if every reported one passed", () => {
    repo.env.STUB_CHECKS = "Checks=SUCCESS\\n";
    const run = merge();
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Browser");
    expect(merged()).toBe("");
  });

  it("says why when gh itself fails (checks pending or failed), rather than stopping silently", () => {
    Object.assign(repo.env, { STUB_CHECKS: "Checks=SUCCESS\\nBrowser=PENDING\\n", STUB_CHECKS_EXIT: "8" });
    const run = merge();
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/refusing PR #42/);
    expect(run.stderr).toContain("Browser=PENDING");
    expect(merged()).toBe("");
  });

  it("refuses a PR whose body carries AI attribution", () => {
    repo.env.STUB_BODY = "What changed.\n\nGenerated with [Claude Code](https://claude.com/claude-code)";
    const run = merge();
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the PR body");
    expect(merged()).toBe("");
  });
});

describe("npm run merge, and release notes", () => {
  /** Merge from `branch`; the label and merge calls it made, in order. */
  const mergeFrom = (branch: string) => {
    repo.env.STUB_BRANCH = branch;
    repo.write(".git/merged.log", "");
    const run = merge();
    return { run, calls: merged().trim().split("\n").filter(Boolean) };
  };
  const index = (calls: string[], start: string) => calls.findIndex((c) => c.startsWith(start));

  it("labels process work 'process' before merging, so release notes leave it out", () => {
    for (const branch of ["chore/hooks", "ci/release-inputs", "test/boards", "docs/readme", "refactor/pages"]) {
      const { run, calls } = mergeFrom(branch);
      expect(run.status, `${branch}: ${run.stderr}`).toBe(0);
      const label = index(calls, "pr edit 42 -R dusty369289/liveline --add-label process");
      expect(label, branch).toBeGreaterThan(-1);
      expect(label, branch).toBeLessThan(index(calls, "pr merge 42"));
    }
  });

  it("leaves fixes and features unlabelled: they're what users read about", () => {
    for (const branch of ["fix/board-late-trains", "feat/calm"]) {
      const { run, calls } = mergeFrom(branch);
      expect(run.status, `${branch}: ${run.stderr}`).toBe(0);
      expect(calls.filter((c) => c.includes("--add-label")), branch).toEqual([]);
      expect(index(calls, "pr merge 42"), branch).toBeGreaterThan(-1);
    }
  });

  it("still refuses a PR whose checks didn't all pass, and labels nothing", () => {
    repo.env.STUB_CHECKS = "Checks=SKIPPED\\nBrowser=SUCCESS\\n";
    const { run, calls } = mergeFrom("chore/hooks");
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("refusing");
    expect(calls).toEqual([]);
  });
});
