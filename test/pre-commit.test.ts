// The commit side of the git hooks: pre-commit (the owner's identity, then the check on the commit itself) and
// npm run commit (scripts/commit.sh). Apart from git-hooks.test.ts (pre-push, commit-msg) so the two run side by
// side: each test spawns git and sh in a throwaway repository (TempRepo), which is most of the unit suite's time.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { script, TempRepo } from "./repo-support";

let repo: TempRepo;

beforeEach(() => {
  repo = new TempRepo();
});
afterEach(() => repo.remove());

/** Put a stand-in `npm` first on PATH, whose `npm run check` runs `check` (shell). Kept in .git, so it's not untracked. */
function stubNpm(check = "exit 0") {
  repo.write(".git/stub-bin/npm", `#!/bin/sh\n${check}\n`, true);
  repo.env.PATH = `${repo.dir}/.git/stub-bin:${repo.env.PATH}`;
}
const preCommit = () => repo.run("sh", [script("git-hooks/pre-commit")]);

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

  it("keeps the test review's state in this checkout, not in the throwaway snapshot", () => {
    repo.write("u.txt", "untracked"); // so the snapshot path runs
    stubNpm(`d="\${TEST_REVIEW_DIR:-.test-review}"; mkdir -p "$d"; echo seen >> "$d/failures.log"`);
    const run = preCommit();
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toMatch(/staged snapshot/);
    expect(repo.run("cat", [".test-review/failures.log"]).stdout).toBe("seen\n");
  });

  describe("with the hooks on, as a checkout has them", () => {
    beforeEach(() => {
      repo.git("config", "core.hooksPath", script("git-hooks"));
      stubNpm(`echo ran >> "${repo.dir}/.git/ran"`);
    });
    const ran = () => repo.run("cat", [".git/ran"]).stdout;

    it("lets the advised repair through: a commit under a wrong identity, amended with --reset-author", () => {
      repo.git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "Second",
        "--author", "Some One <one@example.com>");
      const run = repo.git("commit", "-q", "--amend", "--no-edit", "--reset-author");
      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).toMatch(/no file changes/);
      expect(repo.git("log", "-1", "--format=%an <%ae>").stdout.trim()).not.toContain("Some One");
      expect(ran()).toBe(""); // the tree is the one already committed: nothing new to check
    });

    it("lets a message-only amend through", () => {
      repo.git("commit", "-q", "-m", "Second");
      const run = repo.git("commit", "-q", "--amend", "-m", "Second, reworded");
      expect(run.status, run.stderr).toBe(0);
      expect(repo.git("log", "-1", "--format=%s").stdout.trim()).toBe("Second, reworded");
    });

    it("still refuses the wrong identity on an amend with no file changes", () => {
      repo.git("commit", "-q", "-m", "Second");
      const run = repo.git("-c", "user.name=Some One", "commit", "-q", "--amend", "--no-edit", "--reset-author");
      expect(run.status).not.toBe(0);
      expect(run.stderr).toMatch(/identity/);
    });
  });

  it("checks a clean tree where it stands (the fast path), and leaves no log behind", () => {
    stubNpm(`pwd > "${repo.dir}/.git/where"`);
    expect(preCommit().status).toBe(0);
    expect(repo.run("cat", [".git/where"]).stdout.trim()).toBe(repo.run("pwd", []).stdout.trim());
    expect(repo.git("status", "--short", "--untracked-files=all").stdout).not.toContain(".git-check.log");
  });
});

describe("npm run commit (scripts/commit.sh)", () => {
  const commit = (...args: string[]) => repo.run("sh", [script("commit.sh"), ...args]);
  const count = () => repo.git("rev-list", "--count", "HEAD").stdout.trim();
  beforeEach(() => {
    repo.init();
    repo.write("a.txt", "a");
    repo.write("b.txt", "b");
  });

  it("commits exactly the paths named, with the message, and nothing else", () => {
    const run = commit("Add a", "-m", "Because.", "a.txt");
    expect(run.status, run.stderr).toBe(0);
    expect(repo.git("log", "-1", "--format=%B").stdout.trim()).toBe("Add a\n\nBecause.");
    expect(repo.git("show", "--name-only", "--format=", "HEAD").stdout.trim()).toBe("a.txt");
    expect(repo.git("ls-files", "--others").stdout.trim()).toBe("b.txt");
  });

  it("refuses a bad message before staging anything", () => {
    const run = commit("a".repeat(73), "a.txt");
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/72/);
    expect(repo.staged()).toBe("");
    expect(count()).toBe("1");
  });

  it("unstages what it staged when the commit fails (a pre-commit refusal, say)", () => {
    repo.write(".git/test-hooks/pre-commit", "#!/bin/sh\necho 'check failed' >&2\nexit 1\n", true);
    repo.git("config", "core.hooksPath", ".git/test-hooks");
    const run = commit("Add a", "a.txt");
    expect(run.status).not.toBe(0);
    expect(repo.staged()).toBe("");
    expect(count()).toBe("1");
  });

  it("refuses when something is already staged, and leaves it staged", () => {
    repo.git("add", "b.txt");
    const run = commit("Add a", "a.txt");
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("b.txt");
    expect(repo.staged()).toBe("b.txt");
    expect(count()).toBe("1");
  });
});
