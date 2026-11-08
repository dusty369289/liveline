// scripts/open-pr.sh (npm run pr) with a stand-in `gh`, so no network: a PR's title and body are public the moment
// it's opened, so they're checked first, and gh only ever gets the checked file.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { script, TempRepo } from "./support";

let repo: TempRepo;
// The stand-in logs each argument on its own line, and copies the body file it was handed
const GH = `#!/bin/sh
printf '%s\\n' "$@" >> "$STUB_LOG"
while [ $# -gt 0 ]; do
  [ "$1" = "--body-file" ] && cp "$2" "$STUB_LOG.body"
  shift
done
`;

beforeEach(() => {
  repo = new TempRepo();
  repo.write(".git/stub-bin/gh", GH, true);
  Object.assign(repo.env, { PATH: `${repo.dir}/.git/stub-bin:${repo.env.PATH}`, STUB_LOG: `${repo.dir}/.git/gh.log` });
});
afterEach(() => repo.remove());

const pr = (...args: string[]) => repo.run("sh", [script("open-pr.sh"), ...args]);
const ghArgs = () => repo.run("cat", [".git/gh.log"]).stdout.split("\n").filter(Boolean);

describe("npm run pr", () => {
  it("refuses a body with a 'Generated with' line, and never calls gh", () => {
    repo.write("body.md", "What changed.\n\nGenerated with [Claude Code](https://claude.com/claude-code)\n");
    const run = pr("--title", "Board shows late trains", "--body-file", "body.md");
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the PR body");
    expect(ghArgs()).toEqual([]);
  });

  it("refuses personal details in the title, and never calls gh", () => {
    repo.write("body.md", "What changed.\n");
    const home = ["", "home", "someone", "x"].join("/"); // joined here, or the file's own leak check finds it
    const run = pr("--title", `Fix ${home}`, "--body-file", "body.md");
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the PR title");
    expect(ghArgs()).toEqual([]);
  });

  it("opens a clean PR against main on this repository, with the same body file", () => {
    repo.write("body.md", "What changed, and how it was tested.\n");
    const run = pr("--title", "Board shows late trains", "--body-file", "body.md");
    expect(run.status, run.stderr).toBe(0);
    const args = ghArgs();
    expect(args.slice(0, 2)).toEqual(["pr", "create"]);
    expect(args.join(" ")).toContain("-R dusty369289/liveline --base main");
    expect(args.join(" ")).toContain("--title Board shows late trains");
    expect(args).toContain("--body-file");
    expect(repo.run("cat", [".git/gh.log.body"]).stdout).toBe("What changed, and how it was tested.\n");
  });

  it("refuses --body, --draft and --fill (and their short forms): the text must come from the checked file", () => {
    repo.write("body.md", "What changed.\n");
    for (const extra of [["--body", "x"], ["-b", "x"], ["--draft"], ["-d"], ["--fill"], ["-f"], ["--fill-first"]]) {
      const run = pr("--title", "Board shows late trains", "--body-file", "body.md", ...extra);
      expect(run.status, extra[0]).not.toBe(0);
      expect(run.stderr, extra[0]).toContain(extra[0]);
    }
    expect(ghArgs()).toEqual([]);
  });

  it("needs both a title and a body file", () => {
    repo.write("body.md", "What changed.\n");
    expect(pr("--body-file", "body.md").status).not.toBe(0);
    expect(pr("--title", "Board shows late trains").status).not.toBe(0);
    expect(pr("--title", "Board shows late trains", "--body-file", "missing.md").status).not.toBe(0);
    expect(ghArgs()).toEqual([]);
  });
});
