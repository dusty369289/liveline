// The Android shell around the page: the back button and the system bars. Capacitor is mocked, so these run in Node and
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
  it("follows the phone's theme, as every theme's top bar behind it is light by day and dark at night", async () => {
    const { platform, bars } = await platformOn(true);
    await platform.styleStatusBar();
    expect(bars.setStyle).toHaveBeenCalledWith({ style: "DEFAULT", bar: "StatusBar" });
    expect(bars.setStyle).not.toHaveBeenCalledWith(expect.objectContaining({ style: "DARK" }));
  });

  it("is left alone in the browser build", async () => {
    const { platform, bars } = await platformOn(false);
    await platform.styleStatusBar();
    expect(bars.setStyle).not.toHaveBeenCalled();
  });
});

describe("the gesture bar", () => {
  /** A matchMedia whose dark-mode query can be switched, as Android does when the system theme changes. */
  function fakeDarkMode() {
    const listeners: (() => void)[] = [];
    const query = {
      matches: false,
      addEventListener: vi.fn((_ev: string, fn: () => void) => listeners.push(fn)),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => query));
    return { query, flip: () => listeners.forEach((fn) => fn()) };
  }

  it("follows a day/night switch made while the app is open, listening once", async () => {
    const dark = fakeDarkMode();
    const { platform, bars } = await platformOn(true);
    await platform.styleStatusBar();
    await platform.styleStatusBar();
    expect(dark.query.addEventListener).toHaveBeenCalledTimes(1);
    bars.setStyle.mockClear();
    dark.flip();
    await Promise.resolve();
    expect(bars.setStyle).toHaveBeenCalledWith({ style: "DEFAULT", bar: "NavigationBar" });
    expect(bars.setStyle).toHaveBeenCalledWith({ style: "DEFAULT", bar: "StatusBar" });
  });

  it("shrugs off a style the system refuses", async () => {
    const dark = fakeDarkMode();
    const { platform, bars } = await platformOn(true);
    await platform.styleStatusBar();
    // A plain function, not a vi.fn: a spy watches the promise it returns, which would count as handling the rejection.
    const refuse = () => Promise.reject(new Error("no window"));
    bars.setStyle = refuse as unknown as typeof bars.setStyle;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() => dark.flip()).not.toThrow();
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("is left to the browser in the browser build", async () => {
    const dark = fakeDarkMode();
    const { platform } = await platformOn(false);
    await platform.styleStatusBar();
    expect(dark.query.addEventListener).not.toHaveBeenCalled();
  });
});

describe("the launch screen", () => {
  const res = new URL("../android/app/src/main/res/", import.meta.url);
  const read = (p: string) => readFileSync(new URL(p, res), "utf8");
  // The page before it's drawn is the default theme's (the one a fresh install shows)
  const theme = readFileSync(new URL("../public/css/themes/operator.css", import.meta.url), "utf8");
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

  it("is the app icon on its own background, then the default theme's page (dark at night) until the page draws", () => {
    expect(style("AppTheme.NoActionBarLaunch")).toContain(
      '<item name="windowSplashScreenBackground">@color/ic_launcher_background</item>',
    );
    expect(color(read("values/ic_launcher_background.xml"), "ic_launcher_background")).toMatch(/^#[0-9a-f]{6}$/);
    expect(style("AppTheme.NoActionBar")).toContain('<item name="android:windowBackground">@color/window_background</item>');
    expect(color(read("values/colors.xml"), "window_background")).toBe(token(light, "page"));
    expect(color(read("values-night/colors.xml"), "window_background")).toBe(token(dark, "page"));
  });

  // Without this the splash library draws its default, the generic Android robot. The adaptive icon's own foreground
  // fits: both keep the picture inside the middle two thirds.
  it("shows LiveLine's icon, not Android's default", () => {
    expect(style("AppTheme.NoActionBarLaunch")).toContain(
      '<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>',
    );
    expect(read("mipmap-anydpi-v26/ic_launcher.xml")).toContain('android:drawable="@mipmap/ic_launcher_foreground"');
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

  it("is reopened by another tap while it's awaited, ending the earlier call with the REPLACED the page ignores", () => {
    const takeover = body(/if \(installing != null && pendingConfirm != null\)/);
    expect(takeover).toContain('"REPLACED"');
    expect(takeover).toContain("confirmShown = false");
    expect(takeover).toContain("showConfirm()");
    expect(readFileSync(new URL("../src/ui/updates.ts", import.meta.url), "utf8")).toContain('"REPLACED"');
  });
});
