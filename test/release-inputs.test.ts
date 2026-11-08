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

/** The steps of one job in ci.yml, from its key to the next job's. */
function ciJob(name: string, next?: string): string {
  const ci = read(".github/workflows/ci.yml");
  const start = ci.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThan(-1);
  return ci.slice(start, next ? ci.indexOf(`\n  ${next}:\n`) : undefined);
}

describe("the Gradle build that makes the signed APK", () => {
  it("has its wrapper jar checked against Gradle's published checksums, by an action pinned to a commit", () => {
    const checks = ciJob("checks", "browser");
    expect(checks).toMatch(/- uses: gradle\/actions\/wrapper-validation@[0-9a-f]{40} # v\d+\.\d+\.\d+\n/);
    // straight after checkout, before anything installs or runs
    const step = checks.indexOf("wrapper-validation");
    expect(checks.indexOf("actions/checkout")).toBeLessThan(step);
    expect(step).toBeLessThan(checks.indexOf("npm ci"));
  });

  it("downloads only the Gradle distribution whose SHA-256 it names", () => {
    const props = read("android/gradle/wrapper/gradle-wrapper.properties");
    expect(props).toMatch(/^distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-[\d.]+-all\.zip$/m);
    expect(props).toMatch(/^distributionSha256Sum=[0-9a-f]{64}$/m);
  });
});
