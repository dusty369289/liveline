// "Check for updates": ask GitHub for the latest release and pick out its APK. Pure apart from the getter passed in.
export const RELEASES_API = "https://api.github.com/repos/dusty369289/liveline/releases/latest";

/** "v1.2.3" or "1.2.3-beta.1" to comparable parts. Pre-releases sort before their release. */
export function parseVersion(v: string): { nums: number[]; pre: string } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v.trim());
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? "" } : null;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  if (a.pre === b.pre) return false;
  if (!a.pre) return true; // 1.2.0 is newer than 1.2.0-beta
  if (!b.pre) return false;
  return a.pre > b.pre;
}

export interface Release {
  version: string;
  apkUrl: string | null;
  /** The APK's SHA-256: GitHub's own asset digest, else our published .sha256 file (checked before installing). */
  sha256: string | null;
  sha256Url: string | null;
  pageUrl: string;
  notes: string;
}

/**
 * Release notes in a line people can read: GitHub's generated notes are "* Title by @user in https://…/pull/5"
 * bullets under headings, plus a "Full Changelog" link. Keep just the titles, joined.
 */
export function summary(body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^\*\*Full Changelog\*\*/i.test(l));
  const titles = lines.map((l) => l.replace(/^[*-]\s+/, "").replace(/\s+by @[\w-]+ in https?:\/\/\S+$/, "").replace(/https?:\/\/\S+/g, "").trim())
    .filter(Boolean);
  return titles.join(" · ");
}

export function readRelease(body: unknown): Release | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.tag_name !== "string" || b.draft) return null;
  const assets = Array.isArray(b.assets) ? (b.assets as Array<Record<string, unknown>>) : [];
  const apk = assets.find((a) => typeof a.name === "string" && a.name.endsWith(".apk"));
  const sumFile = assets.find((a) => typeof a.name === "string" && a.name.endsWith(".apk.sha256"));
  const digest = apk && typeof apk.digest === "string" && apk.digest.startsWith("sha256:") ? apk.digest.slice(7) : null;
  const notes = typeof b.body === "string" ? summary(b.body) : "";
  return {
    version: b.tag_name.replace(/^v/, ""),
    apkUrl: apk && typeof apk.browser_download_url === "string" ? apk.browser_download_url : null,
    sha256: digest && /^[0-9a-f]{64}$/i.test(digest) ? digest.toLowerCase() : null,
    sha256Url: sumFile && typeof sumFile.browser_download_url === "string" ? sumFile.browser_download_url : null,
    pageUrl: typeof b.html_url === "string" ? b.html_url : "https://github.com/dusty369289/liveline/releases",
    notes: notes.slice(0, 300),
  };
}
