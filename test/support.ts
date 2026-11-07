// Test doubles and fixtures shared by the unit tests. One copy of each: a test needing a variant extends these.
import { readFileSync } from "node:fs";
import type { StoreKey } from "../src/core/keys";
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
  data = new Map<StoreKey, string>();
  async get(k: StoreKey): Promise<string | null> {
    return this.data.get(k) ?? null;
  }
  async set(k: StoreKey, v: string): Promise<void> {
    this.data.set(k, v);
  }
  async remove(k: StoreKey): Promise<void> {
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
