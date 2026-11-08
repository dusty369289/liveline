// `npm run merge` (scripts/merge-pr.sh) is the only way a PR merges, so it's tested like code: plain shell, with a fake
// `gh` on PATH that logs every call and answers like GitHub. No network.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/merge-pr.sh");
const HEAD = "0123456789abcdef0123456789abcdef01234567";
let dir: string;

const FAKE_GH = `#!/bin/sh
echo "gh $*" >> "$FAKE_LOG"
case "$*" in
  *"--json headRefOid"*) echo "${HEAD}" ;;
  *"--json headRefName"*) echo "$FAKE_BRANCH" ;;
  "pr checks"*) printf 'Checks=%s\\nBrowser=SUCCESS\\n' "$FAKE_CHECKS" ;;
esac
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "merge-pr-"));
  writeFileSync(join(dir, "gh"), FAKE_GH);
  chmodSync(join(dir, "gh"), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Run the script for PR 7 from `branch`; returns its exit status and the gh calls it made, in order. */
function merge(branch: string, checks = "SUCCESS") {
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const run = spawnSync("sh", [SCRIPT, "7"], {
    encoding: "utf8",
    env: { PATH: `${dir}:${process.env.PATH}`, FAKE_LOG: log, FAKE_BRANCH: branch, FAKE_CHECKS: checks },
  });
  return { status: run.status, stderr: run.stderr, calls: readFileSync(log, "utf8").trim().split("\n") };
}
const index = (calls: string[], start: string) => calls.findIndex((c) => c.startsWith(start));

describe("npm run merge", () => {
  it("labels process work 'process' before merging, so release notes leave it out", () => {
    for (const branch of ["chore/hooks", "ci/release-inputs", "test/boards", "docs/readme", "refactor/pages"]) {
      const { status, calls } = merge(branch);
      expect(status, branch).toBe(0);
      const label = index(calls, "gh pr edit 7 -R dusty369289/liveline --add-label process");
      expect(label, branch).toBeGreaterThan(-1);
      expect(label, branch).toBeLessThan(index(calls, "gh pr merge 7"));
    }
  });

  it("leaves fixes and features unlabelled: they're what users read about", () => {
    for (const branch of ["fix/board-late-trains", "feat/calm"]) {
      const { status, calls } = merge(branch);
      expect(status, branch).toBe(0);
      expect(calls.filter((c) => c.includes("--add-label")), branch).toEqual([]);
      expect(index(calls, "gh pr merge 7"), branch).toBeGreaterThan(-1);
    }
  });

  it("still refuses a PR whose checks didn't all pass, and labels nothing", () => {
    const { status, calls, stderr } = merge("chore/hooks", "SKIPPED");
    expect(status).not.toBe(0);
    expect(stderr).toContain("refusing");
    expect(calls.filter((c) => c.startsWith("gh pr edit") || c.startsWith("gh pr merge"))).toEqual([]);
  });
});
