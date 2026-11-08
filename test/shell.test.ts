// The Android shell around the page: the back button and the status bar. Capacitor is mocked, so these run in Node and
// check what the platform asks of it on a phone and in the browser build.
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
