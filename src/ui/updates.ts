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
  confirming?: boolean; // waiting on Android's "Update this app?" dialog: another tap reopens it
}

const DAY = 86_400_000;
const CONFIRM = "Confirm the update in Android's dialog. Closed it? Tap Update again.";
const REOPEN = "Open Android's update dialog"; // the banner's button while confirming
// The plugin's answer to the earlier call when a newer tap takes the install over: the newer call reports how it
// ends, so this one leaves the page alone. (BUSY is shown: no call of this page may be carrying it on.)
const REPLACED = "REPLACED";

/**
 * What each install step says. Android stops the running copy to replace it and doesn't open the new one, so the
 * installing step says so, and the line after it (rarely seen) claims nothing about what happens next.
 */
export function progressText(p: UpdateProgress): string {
  if (p.stage === "permission") return "Allow LiveLine to install updates (Android asks once), then come back.";
  if (p.stage === "downloading") return p.fraction != null && p.fraction >= 0 ? `Downloading… ${Math.round(p.fraction * 100)}%` : "Downloading…";
  // Android closes the app to replace it and won't let it reopen itself; the new version posts a "tap to open" notice
  // (UpdatedNotice), if notifications were allowed when Update was tapped
  if (p.stage === "installing") return "Installing… LiveLine closes when it's done: tap its notification, or open it again from your home screen.";
  return CONFIRM;
}
export const INSTALLED = "Update installed.";

export class Updates {
  info: UpdateInfo = { state: "idle", current: APP_VERSION };
  private readonly saved = new Pref<UpdateInfo | null>(KEYS.update, null);

  /** `changed` shows the new state: the Settings section there, the banner on any other page. */
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

  /** The last check's answer, if it's from today: called before the first page is drawn, so its banner is in it. */
  restore(): void {
    const last = this.recent();
    if (last?.state === "available" && last.latest && isNewer(last.latest, APP_VERSION)) this.info = { ...last, current: APP_VERSION };
  }

  /** Once a day, quietly. A newer version found earlier today is already showing (restore). */
  async daily(): Promise<void> {
    if (!this.recent()) await this.check(false);
  }

  private recent(): UpdateInfo | null {
    const last = this.saved.get();
    return last?.checkedAt && Date.now() - last.checkedAt < DAY ? last : null;
  }

  /** The banner on every page but Settings (which has its own section). One tap installs where Android allows it. */
  banner(route: RouteName): Html | null {
    const u = this.info;
    if (u.state !== "available" || route === "settings") return null;
    return html`<p class="banner" role="note">Version ${u.latest} of LiveLine is available. ${canSelfUpdate && u.apk
      ? html`<button type="button" class="linkish" data-banner-update ${u.progress && !u.confirming ? html`disabled` : ""}>${
          u.confirming ? REOPEN : u.progress ?? "Update now"}</button>`
      : html`<a href="#/settings">Update</a>`}</p>`;
  }

  /** Wire the banner's and Settings' install buttons under `root`. */
  wire(root: ParentNode): void {
    root.querySelectorAll("[data-banner-update], [data-install-update]").forEach((b) => b.addEventListener("click", () => void this.install(root)));
  }

  /**
   * One tap: download, check, install over this version. Key and journeys are app data, so they stay. Taps are
   * ignored while it runs, except while Android's confirm dialog is awaited: if the user closed it (or Android never
   * showed it), another tap asks the plugin again, which ends the earlier call with REPLACED and reopens the dialog.
   */
  async install(root: ParentNode): Promise<void> {
    const u = this.info;
    if (u.state !== "available" || !u.apk || (u.progress && !u.confirming)) return;
    const show = (text: string, confirming = false) => {
      this.info = { ...this.info, progress: text, confirming: confirming || undefined };
      const el = root.querySelector("[data-update-progress], [data-banner-update]");
      if (el) el.textContent = confirming && el.hasAttribute("data-banner-update") ? REOPEN : text;
      root.querySelectorAll<HTMLButtonElement>("[data-install-update], [data-banner-update]").forEach((b) => (b.disabled = !confirming));
    };
    show(u.confirming ? CONFIRM : "Starting…", u.confirming);
    try {
      // While Android's dialog is awaited, Update stays tappable, to reopen it
      await installUpdate({ url: u.apk, version: u.latest ?? "", sha256: u.sha256 ?? null, sha256Url: u.sha256Url ?? null },
        (p) => show(progressText(p), p.stage === "confirm"));
      show(INSTALLED);
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code === REPLACED) return;
      this.info = { ...this.info, progress: undefined, confirming: undefined, message: e instanceof Error ? e.message : String(e) };
      this.changed();
    }
  }
}
