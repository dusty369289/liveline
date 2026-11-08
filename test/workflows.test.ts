// The workflows build and publish what every phone installs, so they're checked like code: each one parses (strictly:
// a duplicated key is an error, not a silent overwrite), and the rules that keep releases safe are pinned here.
// CI also runs actionlint over them (ci.yml, Checks), which knows GitHub's own schema and runs shellcheck.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const DIR = new URL("../.github/workflows/", import.meta.url);
const load = (name: string) => parse(readFileSync(new URL(name, DIR), "utf8"), { uniqueKeys: true, strict: true });

describe("workflows", () => {
  it("every workflow parses and has jobs", () => {
    const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
    expect(files.sort()).toEqual(["ci.yml", "release.yml"]);
    for (const f of files) expect(Object.keys(load(f).jobs ?? {}).length, f).toBeGreaterThan(0);
  });

  it("CI cancels only an older run of the same PR, never a release's tests or a run by hand", () => {
    const { concurrency } = load("ci.yml");
    // Called from release.yml, github.workflow is "Release": its tests get a group of their own.
    expect(concurrency.group).toContain("${{ github.workflow }}");
    expect(concurrency.group).toContain("${{ github.event_name }}");
    expect(concurrency["cancel-in-progress"]).toBe("${{ github.event_name == 'pull_request' }}");
  });
});
