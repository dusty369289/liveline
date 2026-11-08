// The git hooks are the process's guard rails, so they're tested like code. They run as plain shell, with no network,
// each in a throwaway repository (TempRepo).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { script, TempRepo } from "./support";

const OURS = "https://github.com/dusty369289/liveline.git";
let repo: TempRepo;

beforeEach(() => {
  repo = new TempRepo();
});
afterEach(() => repo.remove());

/** Run pre-push as git would: `pre-push <remote name> <remote url>`, the refs on stdin. */
const prePush = (name: string, url: string, refs = "") => repo.run("sh", [script("git-hooks/pre-push"), name, url], refs);

/** Run commit-msg on a message, as git would: the message in a file. */
function commitMsg(message: string) {
  repo.write("MSG", message);
  return repo.run("sh", [script("git-hooks/commit-msg"), "MSG"]);
}

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
    repo.write("a.txt", "x");
    repo.git("add", "a.txt");
    const run = prePush("liveline", OURS);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/staged/);
    expect(run.stderr).toContain("a.txt");
  });
});

describe("commit-msg", () => {
  it("refuses AI attribution: a co-author trailer, a session link, a 'Generated with' line", () => {
    for (const trailer of ["Co-Authored-By: Claude <noreply@anthropic.com>", "Claude-Session: https://example.com/x",
      "Generated with [Claude Code](https://claude.com/claude-code)"]) {
      const run = commitMsg(`Fix the board\n\n${trailer}\n`);
      expect(run.status, trailer).not.toBe(0);
      expect(run.stderr).toMatch(/attribution/);
    }
  });

  it("keeps the words 'generated with' for anything that isn't an AI tool", () => {
    expect(commitMsg("Pictures generated with the demo\n").status).toBe(0);
  });

  it("refuses personal details, as the leak check does for files", () => {
    const home = ["", "home", "someone", "src"].join("/"); // joined here, or the file's own leak check finds it
    const run = commitMsg(`Fix the build\n\nIt broke in ${home}/app.\n`);
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toMatch(/personal/i);
  });

  it("takes a subject of 72 characters and refuses 73", () => {
    expect(commitMsg(`${"a".repeat(72)}\n`).status).toBe(0);
    const run = commitMsg(`${"a".repeat(73)}\n`);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/72/);
  });
});
