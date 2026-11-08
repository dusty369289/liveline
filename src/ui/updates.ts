// Updates: ask GitHub for the latest release (when asked, and quietly once a day), show a banner when there's a
// newer one, and install it in one tap on Android. The state survives restarts (KEYS.update) so the daily check
// doesn't repeat on every launch.
import type { Ms } from "../core/time";
import { isNewer, readRelease, RELEASES_API } from "../core/update";
import { APP_VERSION, canSelfUpdate, getJson, installUpdate, type UpdateProgress } from "../platform";
import { type Html, html } from "./html";
import type { RouteName } from "./routes";
import { KEYS } from "./store/keys";
import { Pref } from "./store/pref";

export interface UpdateInfo {
  state: "idle" | "checking" | "current" | "available" | "error";
  current: string;
  latest?: string;
  url?: string; // the APK, or the release page
  page?: string; // the release page
  notes?: string;
  message?: string;
  checkedAt?: Ms;
  apk?: string | null; // direct APK link, for the one-tap install
  sha256?: string | null;
  sha256Url?: string | null;
  progress?: string; // while installing
}

const DAY = 86_400_000;

/**
 * What each install step says. Android stops the running copy to replace it and doesn't open the new one, so the
 * installing step says so, and the line after it (rarely seen) claims nothing about what happens next.
 */
export function progressText(p: UpdateProgress): string {
  if (p.stage === "permission") return "Allow LiveLine to install updates (Android asks once), then come back.";
  if (p.stage === "downloading") return p.fraction != null && p.fraction >= 0 ? `Downloading… ${Math.round(p.fraction * 100)}%` : "Downloading…";
  if (p.stage === "installing") return "Installing… LiveLine closes when it's done: open it again from your home screen.";
  return "Confirm the update in Android's dialog.";
}
export const INSTALLED = "Update installed.";

export class Updates {
  info: UpdateInfo = { state: "idle", current: APP_VERSION };
  private readonly saved = new Pref<UpdateInfo | null>(KEYS.update, null);

  /** `changed` redraws the page: the banner or the Settings section shows the new state. */
  constructor(private readonly changed: () => void) {}

  async check(show: boolean): Promise<void> {
    this.info = { state: "checking", current: APP_VERSION };
    if (show) this.changed();
    try {
      const r = await getJson(RELEASES_API);
      if (r.status === 404) this.info = { state: "current", current: APP_VERSION, message: "No release has been published yet." };
      else if (r.status !== 200) throw new Error(`GitHub answered ${r.status}`);
      else {
        const rel = readRelease(r.body);
        if (!rel) throw new Error("GitHub's answer didn't make sense");
        this.info = isNewer(rel.version, APP_VERSION)
          ? { state: "available", current: APP_VERSION, latest: rel.version, url: rel.apkUrl ?? rel.pageUrl, page: rel.pageUrl,
              notes: rel.notes, apk: rel.apkUrl, sha256: rel.sha256, sha256Url: rel.sha256Url }
          : { state: "current", current: APP_VERSION, latest: rel.version };
      }
    } catch (e) {
      this.info = { state: "error", current: APP_VERSION, message: `Couldn't check for updates (${e instanceof Error ? e.message : "offline"}).` };
    }
    this.info.checkedAt = Date.now();
    this.saved.set(this.info);
    if (show || this.info.state === "available") this.changed();
  }

  /** Once a day, quietly. A newer version found earlier still shows its banner. */
  async daily(): Promise<void> {
    const last = this.saved.get();
    if (last?.checkedAt && Date.now() - last.checkedAt < DAY) {
      if (last.state === "available" && last.latest && isNewer(last.latest, APP_VERSION)) {
        this.info = { ...last, current: APP_VERSION };
        this.changed();
      }
      return;
    }
    await this.check(false);
  }

  /** The banner on every page but Settings (which has its own section). One tap installs where Android allows it. */
  banner(route: RouteName): Html | null {
    const u = this.info;
    if (u.state !== "available" || route === "settings") return null;
    return html`<p class="banner" role="note">Version ${u.latest} of LiveLine is available. ${canSelfUpdate && u.apk
      ? html`<button type="button" class="linkish" data-banner-update ${u.progress ? html`disabled` : ""}>${u.progress ?? "Update now"}</button>`
      : html`<a href="#/settings">Update</a>`}</p>`;
  }

  /** Wire the banner's and Settings' install buttons under `root`. */
  wire(root: ParentNode): void {
    root.querySelectorAll("[data-banner-update], [data-install-update]").forEach((b) => b.addEventListener("click", () => void this.install(root)));
  }

  /** One tap: download, check, install over this version. Key and journeys are app data, so they stay. */
  async install(root: ParentNode): Promise<void> {
    const u = this.info;
    if (u.state !== "available" || !u.apk || u.progress) return;
    const show = (text: string) => {
      this.info = { ...this.info, progress: text };
      const el = root.querySelector("[data-update-progress], [data-banner-update]");
      if (el) el.textContent = text;
      root.querySelectorAll<HTMLButtonElement>("[data-install-update], [data-banner-update]").forEach((b) => (b.disabled = true));
    };
    show("Starting…");
    try {
      await installUpdate({ url: u.apk, sha256: u.sha256 ?? null, sha256Url: u.sha256Url ?? null }, (p) => show(progressText(p)));
      show(INSTALLED);
    } catch (e) {
      this.info = { ...this.info, progress: undefined, message: e instanceof Error ? e.message : String(e) };
      this.changed();
    }
  }
}
