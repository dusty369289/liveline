// @vitest-environment happy-dom
// The app shell in a DOM: what it draws when a page fails in a way nobody planned for, and how often it draws on
// launch. The core runs on the simulator (demo mode); nothing touches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rail } from "../src/core/rail";
import { App } from "../src/ui/app";
import { RecentPage } from "../src/ui/pages/simple";
import { KEYS } from "../src/ui/store/keys";
import { MemStore, stations } from "./support";

const neverFetch = vi.fn(async () => {
  throw new Error("tests never touch the network");
});

/** Let promises and events queued by the app (the daily update check, a redraw, hashchange) run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

async function setUp(hash: string): Promise<{ app: App; root: HTMLElement; rail: Rail }> {
  location.hash = hash;
  await settle(); // hashchange fires later: let it pass before this app listens
  document.body.innerHTML = '<div id="app"><p class="wrap">Loading…</p></div>';
  const root = document.getElementById("app")!;
  const rail = new Rail({ get: neverFetch } as never, new MemStore(), stations);
  return { app: new App(root, rail), root, rail };
}

// What the app logs for a bug report. Apps from earlier tests still listen for hashchange (an app lives as long as
// the page), so this is silenced for every test rather than counted exactly.
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", neverFetch);
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  neverFetch.mockClear();
  logged.mockRestore();
});

describe("a page that fails", () => {
  it("an error that isn't Realtime Trains' shows 'Something went wrong', not 'Loading…' for good", async () => {
    const { app, root, rail } = await setUp("#/train/C12345:2026-11-07");
    rail.service = async () => {
      throw new TypeError("x is undefined");
    };
    await app.start();
    expect(root.querySelector("main h1")?.textContent).toBe("Something went wrong");
    expect(root.textContent).not.toContain("Loading…");
    expect(root.querySelector("[data-retry]")).not.toBeNull();
    expect(logged).toHaveBeenCalled(); // the real error goes to the console, for a bug report
  });

  it("a saved key that can't be read leaves the demo running, and the app still follows links", async () => {
    const { app, root, rail } = await setUp("#/");
    rail.start = async () => {
      throw new Error("storage is broken");
    };
    await app.start();
    expect(root.querySelector("main h1")?.textContent).toBe("Find your train");
    expect(rail.demo).toBe(true);
    location.hash = "#/recent";
    await vi.waitFor(() => expect(root.querySelector("main h1")?.textContent).toBe("Recent trains"));
  });

  it("a page whose wiring fails still shows, with a message saying so", async () => {
    const { app, root } = await setUp("#/recent");
    const broken = vi.spyOn(RecentPage.prototype, "mount").mockImplementation(() => {
      throw new TypeError("no such button");
    });
    await app.start();
    expect(root.querySelector("main h1")?.textContent).toBe("Recent trains");
    expect(root.querySelector("[data-flash]")?.textContent).toContain("didn't start properly");
    broken.mockRestore();
  });

  it("the flash region is one element for the app's life, and a message shows once", async () => {
    const { app, root } = await setUp("#/recent");
    await app.start();
    const region = root.querySelector("[data-flash]");
    app["ctx"].flash.message = "Key saved and working.";
    await app.render();
    expect(root.querySelector("[data-flash]")).toBe(region);
    expect(region?.textContent).toBe("Key saved and working.");
    await app.render();
    expect(root.querySelector("[data-flash]")).toBe(region);
    expect(region?.textContent).toBe("");
  });
});

describe("a slow page", () => {
  it("marks the app busy while it waits, keeps the old page meanwhile, and clears it once the new page is drawn", async () => {
    const { app, root, rail } = await setUp("#/recent");
    await app.start();
    expect(root.getAttribute("aria-busy")).toBeNull();
    let answer!: (e: Error) => void;
    rail.service = () => new Promise((_, reject) => (answer = reject));
    location.hash = "#/train/C12345:2026-11-07";
    await vi.waitFor(() => expect(root.getAttribute("aria-busy")).toBe("true"));
    expect(root.classList.contains("is-navigating")).toBe(true);
    expect(root.querySelector("main h1")?.textContent).toBe("Recent trains");
    answer(new TypeError("late"));
    await vi.waitFor(() => expect(root.querySelector("main h1")?.textContent).toBe("Something went wrong"));
    expect(root.getAttribute("aria-busy")).toBeNull();
    expect(root.classList.contains("is-navigating")).toBe(false);
  });
});

describe("launch", () => {
  it("with a newer version found earlier today, draws the page once, banner and all", async () => {
    localStorage.setItem(KEYS.update, JSON.stringify({ state: "available", current: "0.0.0", latest: "99.0.0",
      url: "https://example.invalid/a.apk", checkedAt: Date.now() }));
    const { app, root } = await setUp("#/");
    const draws = vi.spyOn(app, "render");
    await app.start();
    await settle();
    expect(draws).toHaveBeenCalledTimes(1);
    expect(root.querySelector("[data-banner-slot]")?.textContent).toContain("Version 99.0.0");
    expect(neverFetch).not.toHaveBeenCalled();
  });
});
