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
});
