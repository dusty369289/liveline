import { describe, expect, it } from "vitest";
import { isNewer, readRelease } from "../src/core/update";
import { INSTALLED, progressText } from "../src/ui/updates";

const SUM = "a".repeat(64);
const release = (assets: unknown[], extra: Record<string, unknown> = {}) => ({
  tag_name: "v0.2.0", html_url: "https://github.com/dusty369289/liveline/releases/tag/v0.2.0", body: "## Changes\nFaster boards.", assets, ...extra,
});

describe("update check", () => {
  it("compares versions", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("v0.1.10", "0.1.9")).toBe(true);
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("1.0.0", "1.0.0-beta.1")).toBe(true);
    expect(isNewer("junk", "0.1.0")).toBe(false);
  });

  it("picks the APK and GitHub's digest for it", () => {
    const r = readRelease(release([
      { name: "LiveLine-v0.2.0.apk", browser_download_url: "https://x/LiveLine-v0.2.0.apk", digest: `sha256:${SUM}` },
      { name: "LiveLine-v0.2.0.apk.sha256", browser_download_url: "https://x/LiveLine-v0.2.0.apk.sha256" },
    ]))!;
    expect(r.version).toBe("0.2.0");
    expect(r.apkUrl).toBe("https://x/LiveLine-v0.2.0.apk");
    expect(r.sha256).toBe(SUM);
    expect(r.sha256Url).toBe("https://x/LiveLine-v0.2.0.apk.sha256");
    expect(r.notes).toBe("Faster boards.");
  });

  it("turns GitHub's generated notes into a readable line", () => {
    const body = "## What's Changed\n* Sticky refresh bar; keep polling after your stop by @dusty369289 in https://github.com/dusty369289/liveline/pull/5\n"
      + "* Circles show which times happened by @dusty369289 in https://github.com/dusty369289/liveline/pull/7\n\n\n"
      + "**Full Changelog**: https://github.com/dusty369289/liveline/compare/v0.1.1...v0.1.2";
    expect(readRelease(release([], { body }))!.notes).toBe("Sticky refresh bar; keep polling after your stop · Circles show which times happened");
  });

  it("falls back to the .sha256 file, and ignores a malformed digest", () => {
    const r = readRelease(release([
      { name: "LiveLine-v0.2.0.apk", browser_download_url: "https://x/a.apk", digest: "sha256:nothex" },
      { name: "LiveLine-v0.2.0.apk.sha256", browser_download_url: "https://x/a.apk.sha256" },
    ]))!;
    expect(r.sha256).toBeNull();
    expect(r.sha256Url).toBe("https://x/a.apk.sha256");
  });

  it("a release with no APK offers the page; drafts are ignored", () => {
    const r = readRelease(release([]))!;
    expect(r.apkUrl).toBeNull();
    expect(r.pageUrl).toContain("/releases/tag/v0.2.0");
    expect(readRelease(release([], { draft: true }))).toBeNull();
    expect(readRelease(null)).toBeNull();
  });
});

describe("one-tap install wording", () => {
  it("says the app closes when installing, and never promises a restart", () => {
    expect(progressText({ stage: "installing" })).toBe("Installing… LiveLine closes when it's done: open it again from your home screen.");
    expect(INSTALLED).not.toMatch(/restart/i);
    for (const stage of ["permission", "downloading", "confirm"] as const) expect(progressText({ stage })).not.toMatch(/restart/i);
  });
});
