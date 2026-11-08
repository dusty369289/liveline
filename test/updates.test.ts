// The one-tap install as the page sees it: the platform is mocked, so this runs in Node and drives Updates through
// the stages Android's updater reports, including closing Android's confirm dialog and tapping Update again.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateProgress } from "../src/platform";

interface Call {
  o: { url: string; version: string };
  progress: (p: UpdateProgress) => void;
  resolve: () => void;
  reject: (e: unknown) => void;
}

/** A Capacitor plugin rejection: an Error with the plugin's code. */
const pluginError = (message: string, code: string) => Object.assign(new Error(message), { code });

/** Updates over a mocked platform, an update on offer, and the banner's button standing in for the page. */
async function updatesOnPhone() {
  vi.resetModules();
  const calls: Call[] = [];
  vi.doMock("../src/platform", () => ({
    APP_VERSION: "1.0.0",
    canSelfUpdate: true,
    getJson: vi.fn(),
    installUpdate: vi.fn((o: Call["o"], progress: (p: UpdateProgress) => void) =>
      new Promise<void>((resolve, reject) => calls.push({ o, progress, resolve, reject }))),
  }));
  const { Updates } = await import("../src/ui/updates");
  const changed = vi.fn();
  const updates = new Updates(changed);
  updates.info = { state: "available", current: "1.0.0", latest: "1.1.0", apk: "https://example.test/app.apk", sha256: "ab" };
  const button = { textContent: "Update now", disabled: false, hasAttribute: (a: string) => a === "data-banner-update" };
  const root = { querySelector: () => button, querySelectorAll: () => [button] } as unknown as ParentNode;
  return { updates, calls, changed, button, root };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.doUnmock("../src/platform");
});

describe("installing an update", () => {
  it("tells the installer which version it's installing, so the notice after it names only that one", async () => {
    // Android closes LiveLine to replace it and won't let it reopen itself: UpdatedNotice posts "tap to open"
    const { updates, calls, root } = await updatesOnPhone();
    void updates.install(root);
    await settle();
    expect(calls[0].o).toMatchObject({ url: "https://example.test/app.apk", version: "1.1.0" });
  });

  it("ignores a second tap while it downloads", async () => {
    const { updates, calls, button, root } = await updatesOnPhone();
    void updates.install(root);
    calls[0].progress({ stage: "downloading", fraction: 0.5 });
    expect(button.disabled).toBe(true);
    void updates.install(root);
    expect(calls).toHaveLength(1);
  });

  it("can reopen Android's confirm dialog by tapping again, once it is waiting on it", async () => {
    const { updates, calls, button, root } = await updatesOnPhone();
    void updates.install(root);
    calls[0].progress({ stage: "confirm", fraction: 1 });
    expect(button.disabled).toBe(false); // the dialog may have been closed, or never shown
    void updates.install(root);
    expect(calls).toHaveLength(2);
    expect(updates.info.progress).toMatch(/Android's dialog/);
  });

  it("stays quiet when the earlier call ends because a newer tap carried on", async () => {
    const { updates, calls, changed, root } = await updatesOnPhone();
    const first = updates.install(root);
    calls[0].progress({ stage: "confirm", fraction: 1 });
    void updates.install(root);
    calls[0].reject(pluginError("Carried on by a newer tap on Update.", "REPLACED"));
    await first;
    expect(updates.info.message).toBeUndefined();
    expect(updates.info.progress).toMatch(/Android's dialog/);
    expect(changed).not.toHaveBeenCalled();
    calls[1].reject(pluginError("The update was cancelled.", "CANCELLED"));
    await settle();
    expect(updates.info).toMatchObject({ progress: undefined, message: "The update was cancelled." });
  });
});
