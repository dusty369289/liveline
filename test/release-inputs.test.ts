// What goes into a release, pinned: the notes users read in Settings leave out process work and bots.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("release notes", () => {
  it("leave out PRs labelled process (npm run merge labels them) and Dependabot's", () => {
    const notes = read(".github/release.yml");
    expect(notes).toMatch(/^changelog:\n {2}exclude:\n/m);
    expect(notes).toMatch(/^ {4}labels:\n {6}- process\n/m);
    expect(notes).toMatch(/^ {4}authors:\n {6}- "dependabot\[bot\]"\n/m);
  });
});
