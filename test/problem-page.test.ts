// A page that couldn't load because RTT was busy or out of reach tries again by itself, but gently: never while the app
// is in the background, less often each time it fails, and as a background call that leaves the search reserve alone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { BoardPage } from "../src/ui/pages/board";
import { ProblemPage, retryDelay } from "../src/ui/pages/simple";
import { html } from "../src/ui/html";
import { parseHash } from "../src/ui/routes";
import { Clock, MemStorage, MemStore, pageContext, stations } from "./support";

/** document, as far as visibility goes: hide() and show() fire visibilitychange like a phone going to the background. */
class FakeDocument {
  visibilityState: "visible" | "hidden" = "visible";
  private listeners = new Set<() => void>();
  addEventListener(_type: string, fn: () => void) {
    this.listeners.add(fn);
  }
  removeEventListener(_type: string, fn: () => void) {
    this.listeners.delete(fn);
  }
  set(state: "visible" | "hidden") {
    this.visibilityState = state;
    for (const fn of [...this.listeners]) fn();
  }
}

let doc: FakeDocument;
let rail: Rail;
beforeEach(() => {
  MemStorage.install();
  vi.useFakeTimers();
  doc = new FakeDocument();
  vi.stubGlobal("document", doc);
  rail = new Rail({ get: () => Promise.reject(new Error("no network")) }, new MemStore(), stations, new Clock(fromLondon(2026, 11, 7, 9, 20)).now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function problem(retrySecs: number | null) {
  const ctx = pageContext(rail);
  const rerender = vi.spyOn(ctx, "rerender");
  const page = new ProblemPage(ctx, parseHash("#/board?station=PAD"), html`<p>busy</p>`, retrySecs);
  page.mount();
  return { page, rerender };
}

describe("trying again by itself", () => {
  it("waits longer after each failure: 30 s, 1, 2 and 4 minutes, then every 5", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([30, 60, 120, 240, 300, 300, 300]);
  });

  it("doesn't try while the app is in the background, and tries once it's back, as a background call", async () => {
    const { page, rerender } = problem(30);
    doc.set("hidden");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(rerender).not.toHaveBeenCalled();
    doc.set("visible");
    expect(rerender).toHaveBeenCalledTimes(1);
    expect(rerender).toHaveBeenCalledWith({ background: true });
    page.dispose();
  });

  it("coming back before it's due waits for the time it said", async () => {
    const { page, rerender } = problem(60);
    doc.set("hidden");
    doc.set("visible");
    expect(rerender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rerender).toHaveBeenCalledTimes(1);
    page.dispose();
  });

  it("leaving the page stops it trying", async () => {
    const { page, rerender } = problem(30);
    page.dispose();
    doc.set("hidden");
    doc.set("visible");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rerender).not.toHaveBeenCalled();
  });

  it("a problem that won't go away by waiting doesn't try again", async () => {
    const { rerender } = problem(null);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(rerender).not.toHaveBeenCalled();
  });

  it("the page drawn by an automatic retry asks as a background call", async () => {
    const page = new BoardPage(pageContext(rail), parseHash("#/board?station=PAD"));
    page.automatic = true;
    const board = vi.spyOn(rail, "board");
    await page.load(() => false);
    expect(board).toHaveBeenCalledWith(expect.objectContaining({ background: true }));
  });
});
