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

/** Put a stand-in `npm` first on PATH, whose `npm run check` runs `check` (shell). Kept in .git, so it's not untracked. */
function stubNpm(check = "exit 0") {
  repo.write(".git/stub-bin/npm", `#!/bin/sh\n${check}\n`, true);
  repo.env.PATH = `${repo.dir}/.git/stub-bin:${repo.env.PATH}`;
}
const preCommit = () => repo.run("sh", [script("git-hooks/pre-commit")]);

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

  it("refuses a pushed commit that someone else wrote or committed, and passes the owner's", () => {
    repo.init();
    const head = () => repo.git("rev-parse", "HEAD").stdout.trim();
    const zero = "0".repeat(40);
    expect(prePush("liveline", OURS, `refs/heads/x ${head()} refs/heads/x ${zero}\n`).status).toBe(0);
    repo.write("b.txt", "y");
    repo.git("add", "b.txt");
    repo.git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "Second", "--author", "Some One <one@example.com>");
    const run = prePush("liveline", OURS, `refs/heads/x ${head()} refs/heads/x ${zero}\n`);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Some One");
  });
});

describe("pre-commit", () => {
  beforeEach(() => {
    repo.init();
    repo.write("a.txt", "x");
    repo.git("add", "a.txt");
  });

  it("commits as the owner", () => {
    stubNpm();
    expect(preCommit().status).toBe(0);
  });

  it("refuses any other name or email, before running the check", () => {
    stubNpm("echo ran > ran.txt");
    for (const [key, value] of [["user.name", "Some One"], ["user.email", "one@example.com"]]) {
      const was = repo.git("config", key).stdout.trim();
      repo.git("config", key, value);
      const run = preCommit();
      expect(run.status, key).not.toBe(0);
      expect(run.stderr).toMatch(/identity/);
      repo.git("config", key, was);
    }
    expect(repo.git("ls-files", "--others").stdout).not.toContain("ran.txt");
  });

  it("checks the commit itself: a staged file that needs an untracked one fails", () => {
    repo.write("main.mjs", `import "./helper.mjs";\n`);
    repo.write("helper.mjs", "export {};\n"); // here in the working tree, but not in the commit
    repo.git("add", "main.mjs");
    stubNpm("node main.mjs");
    expect(repo.run("node", ["main.mjs"]).status).toBe(0); // passes where it stands
    const run = preCommit();
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/check failed/);
    expect(repo.git("worktree", "list").stdout.trim().split("\n")).toHaveLength(1); // the snapshot is cleaned away
  });

  it("checks a clean tree where it stands (the fast path), and leaves no log behind", () => {
    stubNpm(`pwd > "${repo.dir}/.git/where"`);
    expect(preCommit().status).toBe(0);
    expect(repo.run("cat", [".git/where"]).stdout.trim()).toBe(repo.run("pwd", []).stdout.trim());
    expect(repo.git("status", "--short", "--untracked-files=all").stdout).not.toContain(".git-check.log");
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
