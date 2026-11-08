// The Version job of release.yml (scripts/release-check.sh) decides what may become every phone's next update, so
// it's tested like code. It runs as plain shell in a throwaway repository with a fake `gh`: no network.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/release-check.sh");
// Mid-commit, git hands its hooks GIT_DIR and friends: clear them so the throwaway repository's git is its own
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
let dir: string;
let repo: string;
let onMain: string; // a commit on origin/main
let offMain: string; // a commit on a branch only

const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, env, encoding: "utf8" }).stdout.trim();

// Answers the two questions the script asks GitHub: is vX released, and which release is the latest.
const FAKE_GH = `#!/bin/sh
case "$*" in
  "release view -R "*) echo "$FAKE_LATEST" ;;
  "release view v"*) for t in $FAKE_RELEASED; do [ "$t" = "$3" ] && exit 0; done; exit 1 ;;
  *) echo "fake gh: unexpected $*" >&2; exit 2 ;;
esac
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-"));
  repo = join(dir, "repo");
  mkdirSync(repo);
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "gh"), FAKE_GH);
  chmodSync(join(dir, "bin", "gh"), 0o755);
  git("init", "-q", "-b", "main");
  const commit = (m: string) => git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q",
    "--allow-empty", "-m", m);
  commit("on main");
  onMain = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", onMain);
  git("switch", "-q", "-c", "side");
  commit("not merged");
  offMain = git("rev-parse", "HEAD");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

type Run = { event: "workflow_dispatch" | "push"; ref: string; sha: string; input?: string };

function check({ event, ref, sha, input = "" }: Run) {
  const output = join(dir, "output");
  writeFileSync(output, "");
  const run = spawnSync("sh", [SCRIPT], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...env,
      PATH: `${join(dir, "bin")}:${env.PATH}`,
      GITHUB_EVENT_NAME: event,
      GITHUB_REF: ref,
      GITHUB_REF_NAME: ref.replace(/^refs\/(heads|tags)\//, ""),
      GITHUB_SHA: sha,
      GITHUB_REPOSITORY: "owner/app",
      GITHUB_OUTPUT: output,
      INPUT: input,
      FAKE_RELEASED: "v0.1.0 v0.4.0",
      FAKE_LATEST: "v0.4.0",
    },
  });
  return { status: run.status, out: run.stdout + run.stderr, output: readFileSync(output, "utf8") };
}

const dispatch = (input: string, sha = onMain, ref = "refs/heads/main") => check({ event: "workflow_dispatch", ref, sha, input });
const tag = (version: string, sha = onMain) => check({ event: "push", ref: `refs/tags/v${version}`, sha });

describe("release check", () => {
  it("releases a new version from main, by hand or by tag", () => {
    for (const run of [dispatch("1.2.3"), dispatch("v1.2.3"), tag("1.2.3")]) {
      expect(run.out).not.toContain("::error::");
      expect(run.status).toBe(0);
      expect(run.output).toBe(`version=1.2.3\nsha=${onMain}\n`);
    }
  });

  it("refuses a run started from a branch, even at a commit that's on main", () => {
    const run = dispatch("1.2.3", onMain, "refs/heads/feat/x");
    expect(run.status).not.toBe(0);
    expect(run.out).toMatch(/::error::.*from main/);
    expect(run.output).toBe("");
  });

  it("refuses a commit that isn't on main, by hand or by tag", () => {
    for (const run of [dispatch("1.2.3", offMain), tag("1.2.3", offMain)]) {
      expect(run.status).not.toBe(0);
      expect(run.out).toMatch(/::error::.*isn't on main/);
      expect(run.output).toBe("");
    }
  });

  it("refuses a minor or patch over 99, which versionCode can't hold", () => {
    for (const v of ["0.1.100", "0.5.100", "0.100.0"]) {
      const run = dispatch(v);
      expect(run.status, v).not.toBe(0);
      expect(run.out).toMatch(/::error::.*versionCode/);
    }
    expect(dispatch("0.99.99").status).toBe(0);
  });

  it("refuses what isn't a plain version", () => {
    for (const v of ["1.2", "1.2.3-beta", "01.2.3", "1.02.3", "", "1.2.3; true", "1.2.3\n1.2.3"]) {
      const run = dispatch(v);
      expect(run.status, v).not.toBe(0);
      expect(run.out).toMatch(/::error::.*isn't a version like 1\.2\.3/s);
    }
  });

  it("refuses a version already released, or older than the latest", () => {
    expect(dispatch("0.4.0").out).toMatch(/::error::v0\.4\.0 is already released/);
    expect(dispatch("0.3.9").out).toMatch(/::error::v0\.3\.9 isn't newer than the latest release \(v0\.4\.0\)/);
    expect(dispatch("0.3.9").status).not.toBe(0);
  });
});
