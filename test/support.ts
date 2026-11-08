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

/** One event in a made-up RTT answer: times as UK local "HH:MM[:SS]" on 2026-11-07. */
export interface FakeEvent {
  gbtt?: string;
  wtt?: string;
  actual?: string;
  forecast?: string;
  estimate?: string; // RTT's own estimate when there's no report
  noReport?: boolean;
  cancelled?: boolean;
}
export interface FakeLocation {
  name: string;
  crs?: string;
  arr?: FakeEvent;
  dep?: FakeEvent;
  pass?: FakeEvent;
  display?: string;
  allowance?: number; // seconds of performance allowance in the section after this point
}

const at = (hms?: string) => (hms ? `2026-11-07T${hms.length === 5 ? `${hms}:00` : hms}` : undefined);
const event = (e?: FakeEvent) => e && {
  scheduleAdvertised: at(e.gbtt), scheduleInternal: at(e.wtt), realtimeActual: at(e.actual), realtimeForecast: at(e.forecast),
  realtimeEstimate: at(e.estimate), realtimeNoReport: e.noReport, isCancelled: e.cancelled ?? false,
};

/** A small RTT service answer in the shape parse.ts reads, for rule tests that don't need a whole recording. */
export function fakeService(locs: FakeLocation[], systemStatus = { realtimeNetworkRail: "OK", rttCore: "OK" }): unknown {
  return {
    systemStatus,
    service: {
      scheduleMetadata: { identity: "X12345", departureDate: "2026-11-07", operator: { code: "XX", name: "Test" }, trainReportingIdentity: "1X99" },
      locations: locs.map((l) => ({
        location: { description: l.name, shortCodes: l.crs ? [l.crs] : [], longCodes: [l.name.toUpperCase().replace(/\W/g, "")] },
        temporalData: {
          arrival: event(l.arr), departure: event(l.dep), pass: event(l.pass),
          displayAs: l.display ?? (l.pass ? "PASS" : "CALL"),
          scheduledCallType: l.pass ? null : "ADVERTISED_OPEN",
        },
        locationMetadata: l.allowance ? { allowances: { performance: l.allowance } } : {},
      })),
    },
  };
}

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
