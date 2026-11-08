// Test doubles and fixtures shared by the unit tests. One copy of each: a test needing a variant extends these.
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type Http, type HttpResponse, NetworkError } from "../src/core/http";
import type { StoreKey } from "../src/core/keys";
import type { Rail } from "../src/core/rail";
import type { KeyValueStore } from "../src/core/rtt";
import { SimTransport, Timetable } from "../src/core/simulator";
import { StationIndex } from "../src/core/stations";
import type { Ms } from "../src/core/time";
import type { AppContext } from "../src/ui/pages/page";
import { Appearance } from "../src/ui/store/appearance";
import { Journeys, RecentStations } from "../src/ui/store/lists";
import { RecentTrains } from "../src/ui/store/recent-trains";
import { TrainTab } from "../src/ui/store/train-tab";

// Node's own path helpers, not URL: in a DOM test (happy-dom) the global URL is the DOM's, which reads file: oddly
const here = `${dirname(fileURLToPath(import.meta.url))}/`;

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

/**
 * The demo railway on `clock`. Its timetable is built once for every test: building one lays out a whole day's
 * trains, and a timetable is never changed after (each service is complete when built), so sharing it is safe.
 */
const TIMETABLE = new Timetable();
export const simulator = (clock: () => Ms): SimTransport => new SimTransport(clock, TIMETABLE);

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

/** A key FakeRtt accepts, as a refresh token. */
export const GOOD = "good-refresh-token-0123456789abcdef";

/**
 * RTT, faked. Refresh-token flow like the real one: /api/info refuses the refresh token, the access token works.
 * `offline` makes every request fail as a dropped connection; `remainingHour` adds that rate-limit header. Boards answer
 * `location` (204, no services, unless given one), a train answers `service`.
 */
export class FakeRtt implements Http {
  calls: string[] = [];
  params: Array<Record<string, string>> = [];
  offline = false;
  remainingHour: string | null = null;
  constructor(private ents = ["allowAllocationsPassenger", "allowDetailed"], private hour = "100",
    private service: HttpResponse | null = null, private location: unknown = null) {}
  async get(path: string, p: Record<string, string>, token?: string | null): Promise<HttpResponse> {
    if (this.offline) throw new NetworkError("offline");
    this.calls.push(path);
    this.params.push(p);
    const h: Record<string, string> = { "x-ratelimit-limit-minute": "10", "x-ratelimit-limit-hour": this.hour };
    if (this.remainingHour != null) h["x-ratelimit-remaining-hour"] = this.remainingHour;
    if (path === "/api/get_access_token") {
      return token === GOOD ? { status: 200, headers: h, body: { token: "short-access", validUntil: "2026-11-07T18:00:00Z" } }
        : { status: 401, headers: h, body: { error: "no" } };
    }
    if (path === "/api/info") {
      return token === "short-access" ? { status: 200, headers: h, body: { api_version: "2026-07-25", credentials: { entitlements: this.ents } } }
        : { status: 401, headers: h, body: { error: "no" } };
    }
    if (path === "/gb-nr/service") return this.service ?? { status: 200, headers: h, body: { service: { scheduleMetadata: { identity: "X1", departureDate: "2026-11-07" } } } };
    if (path === "/gb-nr/location") return this.location ? { status: 200, headers: h, body: this.location } : { status: 204, headers: h, body: null };
    return { status: 404, headers: h, body: null };
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

/**
 * What pages share (AppContext), for unit tests of pages: the real stored lists over a fresh in-memory localStorage,
 * the given Rail, and no update checks. Call after MemStorage.install().
 */
export function pageContext(rail: Rail): AppContext {
  return {
    rail, updates: {} as AppContext["updates"], appearance: new Appearance(), trains: new RecentTrains(),
    journeys: new Journeys(), stations: new RecentStations(), trainTab: new TrainTab(), flash: { message: null, error: null },
    problems: new Map(), rerender: () => {},
  };
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
 * Parsed markup (html.ts `fragment`) is searched for real: `[attr]` finds the element carrying that attribute and comes
 * back as a FakeElement holding only that element's markup (see `elementMarkup`), or null if the view has none.
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
    const tpl = {
      innerHTML: "",
      content: {
        querySelector: (sel: string) => {
          const m = elementMarkup(tpl.innerHTML, sel);
          return m == null ? null : new FakeElement({}, m);
        },
      },
    };
    return tpl;
  }
  static install(): FakeDocument {
    const d = new FakeDocument();
    (globalThis as unknown as { document: FakeDocument }).document = d;
    return d;
  }
}

/**
 * The markup of the element carrying `[attr]`, from its opening tag to its own closing tag (nested tags of the same
 * name counted), or null if there is none. Only attribute selectors: anything else throws, so a test can't pass by
 * matching nothing.
 */
export function elementMarkup(markup: string, sel: string): string | null {
  const attr = /^\[([\w-]+)\]$/.exec(sel)?.[1];
  if (!attr) throw new Error(`FakeDocument only finds [attribute] selectors, not ${sel}`);
  const open = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\s${attr}(?=[\\s=>])[^>]*>`, "i").exec(markup);
  if (!open) return null;
  const tag = open[1];
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tags.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let t = tags.exec(markup); t; t = tags.exec(markup)) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return markup.slice(open.index, t.index + t[0].length);
  }
  throw new Error(`no closing </${tag}> for ${sel}`);
}

/** WCAG contrast between two #rgb or #rrggbb colours (4.5 for text, 3 for graphics): the design and badge checks. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    let h = hex.replace("#", "");
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A #rrggbb colour's OKLCH lightness (0 to 1) and chroma (0 for grey; vivid colours around 0.2 to 0.3). */
export function oklch(hex: string): { l: number; c: number } {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, c: Math.hypot(a, bb) };
}
