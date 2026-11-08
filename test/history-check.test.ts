// scripts/history-check.mjs: what CI, pre-push and the merge script use to check commits and PR text that no local
// hook vouched for. Run as CI runs it, in a throwaway repository, with the PR text in the environment.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { script, TempRepo } from "./support";

let repo: TempRepo;
beforeEach(() => {
  repo = new TempRepo();
  repo.init();
});
afterEach(() => repo.remove());

function check(args: string[], pr: { title?: string; body?: string } = {}) {
  repo.env.PR_TITLE = pr.title ?? "";
  repo.env.PR_BODY = pr.body ?? "";
  return repo.run("node", [script("history-check.mjs"), ...args]);
}
const commit = (message: string, ...extra: string[]) => {
  repo.write(`f${Math.random()}.txt`, "x");
  repo.git("add", "-A");
  repo.git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", message, ...extra);
};

describe("PR text", () => {
  it("refuses a body carrying the AI tool's 'Generated with' line, and names where", () => {
    const run = check([], { title: "Board shows late trains", body: "What changed.\n\nGenerated with [Claude Code](https://claude.com/claude-code)" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the PR body");
    expect(run.stderr).toMatch(/attribution/);
  });

  it("passes plain text, the words 'generated with' included", () => {
    expect(check([], { title: "README pictures", body: "Pictures generated with the demo." }).status).toBe(0);
  });

  it("refuses personal details in the title", () => {
    const home = ["", "home", "someone", "x"].join("/"); // joined here, or the file's own leak check finds it
    const run = check([], { title: `Fix ${home}` });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the PR title");
  });
});

describe("commits", () => {
  it("passes the owner's commits", () => {
    commit("Second");
    expect(check(["HEAD~1..HEAD"]).status).toBe(0);
  });

  it("refuses a commit by anyone else, and one whose message carries attribution", () => {
    commit("Second", "--author", "Some One <one@example.com>");
    commit("Third\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    const run = check(["HEAD~2..HEAD"]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the author is Some One <one@example.com>");
    expect(run.stderr).toMatch(/message carries AI attribution/);
  });
});
