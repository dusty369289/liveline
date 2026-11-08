// What the tests of the git hooks and commit scripts share: the owner's identity, the scripts' paths, and a throwaway
// repository. Kept apart from support.ts (the app's test doubles), so each file has one job.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = `${dirname(fileURLToPath(import.meta.url))}/`;

/** The one identity commits here may carry (scripts/owner.sh, which the hooks and checks read too). */
export const OWNER = (() => {
  const sh = readFileSync(`${here}../scripts/owner.sh`, "utf8");
  const get = (k: string) => sh.match(new RegExp(`^${k}=(.+)$`, "m"))![1];
  return { name: get("OWNER_NAME"), email: get("OWNER_EMAIL") };
})();

/** A script under scripts/, by absolute path, so it runs the same from any directory. */
export const script = (path: string) => `${here}../scripts/${path}`;

/**
 * A throwaway git repository for testing the hooks and commit scripts, so they never depend on what's staged here
 * (pre-commit runs these tests mid-commit). It commits as the owner unless a test changes that.
 */
export class TempRepo {
  readonly dir = mkdtempSync(join(tmpdir(), "liveline-repo-"));
  // Mid-commit, git hands its hooks GIT_DIR, GIT_INDEX_FILE and friends: without clearing them, the throwaway
  // repository's git would read this checkout's index instead
  env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => !e[0].startsWith("GIT_") && e[1] != null));

  constructor() {
    this.git("init", "-q", "-b", "main");
    this.git("config", "user.name", OWNER.name);
    this.git("config", "user.email", OWNER.email);
    this.git("config", "commit.gpgsign", "false");
  }

  run(cmd: string, args: string[], input = ""): SpawnSyncReturns<string> {
    return spawnSync(cmd, args, { cwd: this.dir, env: this.env, input, encoding: "utf8" });
  }
  git(...args: string[]): SpawnSyncReturns<string> {
    return this.run("git", args);
  }
  /** Write a file (and its folders); `exec` makes it runnable, for a hook or a stub command. */
  write(path: string, text: string, exec = false): void {
    const p = join(this.dir, path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    if (exec) chmodSync(p, 0o755);
  }
  /** A first commit with the hooks off, so tests start from a branch with history. */
  init(): void {
    this.write("README", "x\n");
    this.git("add", "README");
    this.git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "First");
  }
  staged(): string {
    return this.git("diff", "--cached", "--name-only").stdout.trim();
  }
  remove(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
