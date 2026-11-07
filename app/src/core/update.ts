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
  pageUrl: string;
  notes: string;
}

export function readRelease(body: unknown): Release | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.tag_name !== "string" || b.draft) return null;
  const assets = Array.isArray(b.assets) ? (b.assets as Array<Record<string, unknown>>) : [];
  const apk = assets.find((a) => typeof a.name === "string" && a.name.endsWith(".apk"));
  const notes = typeof b.body === "string" ? b.body.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? "" : "";
  return {
    version: b.tag_name.replace(/^v/, ""),
    apkUrl: apk && typeof apk.browser_download_url === "string" ? apk.browser_download_url : null,
    pageUrl: typeof b.html_url === "string" ? b.html_url : "https://github.com/dusty369289/liveline/releases",
    notes: notes.slice(0, 300),
  };
}
