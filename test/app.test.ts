// @vitest-environment happy-dom
// The app shell in a DOM: how often it draws on launch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rail } from "../src/core/rail";
import { App } from "../src/ui/app";
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

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", neverFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  neverFetch.mockClear();
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
