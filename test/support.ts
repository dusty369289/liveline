// Test doubles and fixtures shared by the unit tests. One copy of each: a test needing a variant extends these.
import { readFileSync } from "node:fs";
import type { KeyValueStore } from "../src/core/rtt";
import { StationIndex } from "../src/core/stations";
import type { Ms } from "../src/core/time";

const here = new URL(".", import.meta.url).pathname;

/** Read a file under test/ (fixtures, golden files). */
export const readTestFile = (path: string): string => readFileSync(`${here}${path}`, "utf8");
export const readJson = <T = unknown>(path: string): T => JSON.parse(readTestFile(path)) as T;
/** A real RTT recording or a spec-derived fixture from test/fixtures/rtt/. */
export const fixture = (name: string): unknown => readJson(`fixtures/rtt/${name}`);

/** The bundled station list, loaded once. */
export const stations = StationIndex.fromRaw(JSON.parse(readFileSync(`${here}../src/data/stations.json`, "utf8")));

/** A clock tests move by hand. */
export class Clock {
  constructor(public t: Ms) {}
  now = (): Ms => this.t;
  advance(seconds: number): void {
    this.t += seconds * 1000;
  }
}

/** The platform's private key store (Capacitor Preferences on the phone), in memory. */
export class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  async get(k: string): Promise<string | null> {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string): Promise<void> {
    this.data.set(k, v);
  }
  async remove(k: string): Promise<void> {
    this.data.delete(k);
  }
}

/** localStorage, in memory, for the UI's stored lists. `install()` puts a fresh one on globalThis. */
export class MemStorage {
  private d = new Map<string, string>();
  getItem(k: string): string | null {
    return this.d.has(k) ? this.d.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.d.set(k, v);
  }
  removeItem(k: string): void {
    this.d.delete(k);
  }
  clear(): void {
    this.d.clear();
  }
  static install(): MemStorage {
    const s = new MemStorage();
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = s;
    return s;
  }
}

/**
 * Just enough of a DOM for a page's wiring, without a browser: an element is a tree of named parts found by selector.
 * Parsed markup (html.ts `fragment`) comes back as one FakeElement per selector, holding the whole view's markup.
 */
export class FakeElement {
  isConnected = true;
  dataset: Record<string, string> = {};
  replacedWith: FakeElement[] = [];
  appended: unknown[] = [];
  constructor(public parts: Record<string, FakeElement> = {}, public markup = "") {}
  querySelector(sel: string): FakeElement | null {
    if (sel in this.parts) return this.parts[sel];
    for (const p of Object.values(this.parts)) {
      const found = p.querySelector(sel);
      if (found) return found;
    }
    return null;
  }
  replaceWith(n: FakeElement): void {
    this.replacedWith.push(n);
  }
  append(...n: unknown[]): void {
    this.appended.push(...n);
  }
  addEventListener(): void {}
}

/** `document` for page tests: visibility you set, listeners you fire, and templates that parse to FakeElements. */
export class FakeDocument {
  visibilityState: "visible" | "hidden" = "visible";
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  listening(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  fire(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  createElement() {
    const tpl = { innerHTML: "", content: { querySelector: () => new FakeElement({}, tpl.innerHTML) } };
    return tpl;
  }
  static install(): FakeDocument {
    const d = new FakeDocument();
    (globalThis as unknown as { document: FakeDocument }).document = d;
    return d;
  }
}
