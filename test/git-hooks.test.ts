// The git hooks are the process's guard rails, so they're tested like code. They run as plain shell, with no network,
// each in a throwaway repository (so they never depend on what's staged here: pre-commit runs these tests mid-commit).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HOOK = resolve("scripts/git-hooks/pre-push");
const OURS = "https://github.com/dusty369289/liveline.git";
let repo: string;
// Mid-commit, git hands its hooks GIT_DIR, GIT_INDEX_FILE and friends: without clearing them, the throwaway
// repository's git would read this checkout's index instead
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "hooks-"));
  git("init", "-q");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

/** Run pre-push as git would: `pre-push <remote name> <remote url>`, the refs on stdin. */
const prePush = (name: string, url: string) => spawnSync("sh", [HOOK, name, url], { cwd: repo, env, input: "", encoding: "utf8" });

describe("pre-push", () => {
  it("pushes to this repository, however the remote is named or reached", () => {
    for (const url of [OURS, "https://github.com/dusty369289/liveline",
      "git@github.com:dusty369289/liveline.git", "ssh://git@github.com/dusty369289/liveline.git"]) {
      expect(prePush("origin", url).status, url).toBe(0);
    }
  });

  it("refuses any other repository, and says which one is the right one", () => {
    for (const url of ["https://github.com/dusty369289/old-name.git", "https://github.com/someone/liveline.git",
      "https://github.com/dusty369289/liveline-old.git"]) {
      const run = prePush("origin", url);
      expect(run.status, url).not.toBe(0);
      expect(run.stderr).toContain("dusty369289/liveline");
    }
  });

  it("refuses while files are staged: a commit just before it probably failed", () => {
    writeFileSync(join(repo, "a.txt"), "x");
    git("add", "a.txt");
    const run = prePush("liveline", OURS);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/staged/);
    expect(run.stderr).toContain("a.txt");
  });
});
