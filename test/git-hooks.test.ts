// The git hooks are the process's guard rails, so they're tested like code. They run as plain shell, with no network.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Run pre-push as git would: `pre-push <remote name> <remote url>`, the refs on stdin. */
const prePush = (name: string, url: string) =>
  spawnSync("sh", ["scripts/git-hooks/pre-push", name, url], { input: "", encoding: "utf8" });

describe("pre-push", () => {
  it("pushes to this repository, however the remote is named or reached", () => {
    for (const url of ["https://github.com/dusty369289/liveline.git", "https://github.com/dusty369289/liveline",
      "git@github.com:dusty369289/liveline.git", "ssh://git@github.com/dusty369289/liveline.git"]) {
      expect(prePush("origin", url).status, url).toBe(0);
    }
  });

  it("refuses any other repository, and says which one is the right one", () => {
    for (const url of ["https://github.com/dusty369289/old-name.git","https://github.com/someone/liveline.git",
      "https://github.com/dusty369289/liveline-old.git"]) {
      const run = prePush("origin", url);
      expect(run.status, url).not.toBe(0);
      expect(run.stderr).toContain("dusty369289/liveline");
    }
  });
});
