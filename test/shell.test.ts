// The Android shell around the page: the back button and the status bar. Capacitor is mocked, so these run in Node and
// check what the platform asks of it on a phone and in the browser build.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

type BackListener = (e: { canGoBack: boolean }) => void;

/** Load src/platform afresh over a mocked Capacitor that reports `native`, and record what it is asked to do. */
async function platformOn(native: boolean) {
  vi.resetModules();
  const listeners: BackListener[] = [];
  const app = {
    addListener: vi.fn(async (_ev: string, fn: BackListener) => {
      listeners.push(fn);
      return { remove: async () => {} };
    }),
    minimizeApp: vi.fn(async () => {}),
  };
  const bars = { setStyle: vi.fn(async () => {}) };
  vi.doMock("@capacitor/app", () => ({ App: app }));
  vi.doMock("@capacitor/core", async (real) => ({
    ...(await real<typeof import("@capacitor/core")>()),
    Capacitor: { isNativePlatform: () => native, getPlatform: () => (native ? "android" : "web") },
    SystemBars: bars,
  }));
  const platform = await import("../src/platform");
  return { platform, app, bars, listeners };
}

afterEach(() => {
  vi.doUnmock("@capacitor/app");
  vi.doUnmock("@capacitor/core");
  vi.unstubAllGlobals();
});

describe("the back button", () => {
  it("is handled once on a phone, however often start-up asks", async () => {
    const { platform, app } = await platformOn(true);
    await platform.handleBack();
    await platform.handleBack();
    expect(app.addListener).toHaveBeenCalledTimes(1);
    expect(app.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
  });

  it("is left to the browser in the browser build", async () => {
    const { platform, app } = await platformOn(false);
    await platform.handleBack();
    expect(app.addListener).not.toHaveBeenCalled();
  });

  it("goes back a page when there is one, and leaves the app from the first page", async () => {
    const back = vi.fn();
    vi.stubGlobal("history", { back });
    const { platform, app, listeners } = await platformOn(true);
    await platform.handleBack();
    listeners[0]!({ canGoBack: true });
    expect(back).toHaveBeenCalledTimes(1);
    expect(app.minimizeApp).not.toHaveBeenCalled();
    listeners[0]!({ canGoBack: false });
    expect(back).toHaveBeenCalledTimes(1);
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
  });
});

describe("the status bar", () => {
  it("has light icons on a phone, over the navy top bar in both themes", async () => {
    const { platform, bars } = await platformOn(true);
    await platform.styleStatusBar();
    expect(bars.setStyle).toHaveBeenCalledWith({ style: "DARK", bar: "StatusBar" });
  });

  it("is left alone in the browser build", async () => {
    const { platform, bars } = await platformOn(false);
    await platform.styleStatusBar();
    expect(bars.setStyle).not.toHaveBeenCalled();
  });
});

describe("the launch screen", () => {
  const res = new URL("../android/app/src/main/res/", import.meta.url);
  const read = (p: string) => readFileSync(new URL(p, res), "utf8");
  const theme = readFileSync(new URL("../public/css/themes/platform.css", import.meta.url), "utf8");
  const [light, dark] = theme.split("prefers-color-scheme: dark");
  const token = (css: string | undefined, name: string) =>
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css ?? "")?.[1]?.toLowerCase();
  const color = (xml: string, name: string) =>
    new RegExp(`<color name="${name}">(#[0-9A-Fa-f]{6})</color>`).exec(xml)?.[1]?.toLowerCase();
  const style = (name: string) =>
    new RegExp(`<style name="${name.replace(/\./g, "\\.")}"[^>]*>([\\s\\S]*?)</style>`).exec(read("values/styles.xml"))?.[1] ?? "";

  it("has no Capacitor stock splash picture", () => {
    const left = readdirSync(res)
      .filter((d) => d.startsWith("drawable"))
      .filter((d) => existsSync(new URL(`${d}/splash.png`, res)));
    expect(left).toEqual([]);
    expect(read("values/styles.xml")).not.toContain("@drawable/splash");
  });

  it("is the app icon on navy, then the page's own paper (deep navy at night) until the page draws", () => {
    expect(style("AppTheme.NoActionBarLaunch")).toContain(
      '<item name="windowSplashScreenBackground">@color/ic_launcher_background</item>',
    );
    expect(color(read("values/ic_launcher_background.xml"), "ic_launcher_background")).toBe(token(light, "sign"));
    expect(style("AppTheme.NoActionBar")).toContain('<item name="android:windowBackground">@color/window_background</item>');
    expect(color(read("values/colors.xml"), "window_background")).toBe(token(light, "page"));
    expect(color(read("values-night/colors.xml"), "window_background")).toBe(token(dark, "page"));
  });
});

// No Java test harness here (and the emulator crashes on the dev machine), so this reads UpdaterPlugin.java for the
// shape of the fix. Capacitor calls handleOnResume from inside Activity.onResume, before AndroidX moves the lifecycle
// to RESUMED, so showConfirm (which needs RESUMED) must run from an ON_RESUME observer instead.
describe("the updater's confirm dialog", () => {
  const java = readFileSync(new URL("../android/app/src/main/java/dev/liveline/app/UpdaterPlugin.java", import.meta.url), "utf8");
  const body = (signature: RegExp) => {
    const at = java.search(signature);
    if (at < 0) return "";
    let depth = 0;
    for (let i = java.indexOf("{", at); i < java.length; i++) {
      if (java[i] === "{") depth++;
      else if (java[i] === "}" && --depth === 0) return java.slice(at, i + 1);
    }
    return "";
  };

  it("is not started from handleOnResume, where the activity isn't resumed yet", () => {
    expect(body(/void handleOnResume\(\)/)).not.toContain("showConfirm");
  });

  it("is started once the activity really is resumed, by a lifecycle observer added on load and removed on destroy", () => {
    expect(body(/public void onResume\(@NonNull LifecycleOwner owner\)/)).toContain("showConfirm()");
    expect(body(/public void load\(\)/)).toMatch(/getLifecycle\(\)\.addObserver\(/);
    expect(body(/void handleOnDestroy\(\)/)).toMatch(/getLifecycle\(\)\.removeObserver\(/);
  });
});
