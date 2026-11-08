// What the screens call: boards, trains, the key and the plan, for one person on one device. With no key it runs
// on the simulator (demo); with one, it talks to RTT itself.
import { Budget } from "./budget";
import { STORE } from "./keys";
import { build, type Timeline } from "./engine";
import type { Http } from "./http";
import { type Board, type BoardRow, booked, forPassengers, isEmpty, type Times } from "./models";
import { type Formation, formationFor, parseFormations } from "./formation";
import { parseBoard, parseService } from "./parse";
import { pollAfter } from "./poll";
import { AuthError, BusyError, type Fetched, isDetailed, type KeyValueStore, RttClient, RttError, type TokenInfo } from "./rtt";
import { SimTransport } from "./simulator";
import type { Station, StationIndex } from "./stations";
import { type Ms, parseDate } from "./time";

export { AuthError, BusyError, OfflineError, RttError } from "./rtt";

const KEY = STORE.key;

export interface BoardResult {
  board: Board;
  rows: BoardRow[];
  station: Station | undefined;
  fetched: Fetched;
  mode: "dep" | "arr";
  to: Station | undefined;
  hidden: number; // empty stock and staff-only calls left out
  showAll: boolean;
}

export interface ServiceResult {
  timeline: Timeline;
  formation: Formation; // how it's made up where it is now (formation.ts); kept off Service, which the goldens pin
  fetched: Fetched;
  refreshAfter: number | null; // seconds before asking again (poll.ts), or null: nothing more will change
}

export interface Tier {
  name: "Demo" | "Free" | "Hobbyist" | "Team or above";
  detailed: boolean;
  allocations: boolean;
  perMinute: number;
  perHour: number;
}
export const precision = (t: Tier) => (t.detailed ? "to the quarter minute" : "to the minute");

export const TIERS: Array<[string, string, string]> = [
  ["Free", "Live times to the minute, boards and trains, 10 calls a minute and 100 an hour.", "£0"],
  ["Hobbyist", "Detailed mode: reports to the quarter minute, headcodes, running lines, unit numbers and class, empty stock.", "£4 a month"],
  ["Team", "As Hobbyist, with 40 calls a minute and 1200 an hour, so trains update more often.", "£29 a month"],
];

/** What someone pasted, tidied: quotes and an `RTT_TOKEN=` prefix removed. Refuses what can't be a key. */
export function cleanToken(token: string): string {
  let t = (token ?? "").trim().replace(/^["']|["']$/g, "");
  if (t.startsWith("RTT_TOKEN=")) t = t.slice("RTT_TOKEN=".length);
  if (t.length < 20 || t.length > 2000 || /\s/.test(t)) {
    throw new AuthError("That doesn't look like a Realtime Trains key. Copy it again from api-portal.rtt.io.");
  }
  return t;
}

export class Rail {
  client!: RttClient;
  budget!: Budget;
  demo = true;
  readonly sim: SimTransport;
  private tokenError: string | null = null;

  constructor(
    private http: Http,
    readonly store: KeyValueStore,
    readonly stations: StationIndex,
    readonly clock: () => Ms = Date.now,
  ) {
    this.sim = new SimTransport(clock, undefined, (crs) => stations.byCrs(crs)?.name ?? null);
    this.useDemo();
  }

  private useDemo() {
    this.demo = true;
    this.budget = Budget.unlimited(this.clock);
    this.client = new RttClient(this.sim, "demo", this.budget, this.clock);
  }

  private useKey(token: string) {
    this.demo = false;
    this.budget = new Budget(this.clock);
    this.client = new RttClient(this.http, token, this.budget, this.clock, this.store);
  }

  /** Pick up the key saved on this device, if any. */
  async start(): Promise<void> {
    const saved = await this.store.get(KEY);
    if (saved) this.useKey(saved);
  }

  get tokenHint() {
    return this.demo ? null : this.client.tokenHint;
  }

  get lastTokenError() {
    return this.tokenError;
  }

  async tokenInfo(): Promise<TokenInfo | null> {
    if (this.demo) return null;
    // the saved access token and entitlements first: opening the app shouldn't cost 3 calls
    if (this.client.info) this.tokenError = null; // a later call checked the key after all
    if (!this.client.info) await this.client.restore();
    if (!this.client.info && !this.tokenError) {
      try {
        await this.client.checkToken();
      } catch (e) {
        // Only a refusal is about the key. Busy or offline says nothing about it: the next call tries again, rather
        // than show "needs attention" all session over a moment without signal.
        if (e instanceof AuthError) this.tokenError = e.message;
        else if (!(e instanceof RttError)) throw e;
      }
    }
    return this.client.info;
  }

  async tier(): Promise<Tier> {
    const lim = this.budget.limits;
    if (this.demo) return { name: "Demo", detailed: false, allocations: false, perMinute: 10, perHour: 100 };
    const info = await this.tokenInfo();
    const ents = new Set(info?.entitlements ?? []);
    const detailed = ents.has("allowDetailed");
    const allocations = ents.has("allowAllocations") || ents.has("allowAllocationsPassenger");
    const name =
      ents.has("allowFullAllocationListing") || ents.has("allowFullAllocationListingPassenger") || lim.hour > 100
        ? "Team or above"
        : detailed ? "Hobbyist" : "Free";
    return { name, detailed, allocations, perMinute: lim.minute, perHour: lim.hour };
  }

  /** Check a new key with RTT (1 to 3 calls), and only then keep it on this device. */
  async setKey(raw: string): Promise<TokenInfo> {
    const token = cleanToken(raw);
    const budget = new Budget(this.clock);
    const probe = new RttClient(this.http, token, budget, this.clock, this.store);
    const info = await probe.checkToken();
    await this.store.set(KEY, token);
    // keep the client that just checked it: it holds the access token and has counted the calls
    this.demo = false;
    this.budget = budget;
    this.client = probe;
    this.tokenError = null;
    return info;
  }

  async removeKey(): Promise<void> {
    await this.store.remove(KEY);
    await this.store.remove(STORE.access);
    this.tokenError = null;
    this.useDemo();
  }

  detailed(): boolean {
    return isDetailed(this.client.info);
  }

  async board(opts: { station: string; when?: Ms | null; window?: number; to?: string | null; mode?: "dep" | "arr";
    showAll?: boolean; force?: boolean; background?: boolean }): Promise<BoardResult> {
    const { station, window = 60, mode = "dep", showAll = false, force = false, background = false } = opts;
    const st = this.stations.resolve(station);
    const code = st ? st.crs : station.trim().toUpperCase();
    if (!code) throw new RttError("Type a station name or code.");
    const toSt = opts.to ? this.stations.resolve(opts.to) : undefined;
    if (opts.to && !toSt) throw new RttError(`Couldn't find a station called “${opts.to}”.`);
    if (!(window >= 1 && window <= 240)) throw new RttError("The time window must be between 1 and 240 minutes.");
    await this.tokenInfo();
    const when = opts.when ?? this.clock();
    // with a second station, departures go on to call there and arrivals come from there
    const other = toSt ? toSt.crs : null;
    let f: Fetched;
    try {
      f = mode === "arr"
        ? await this.client.location(code, when, window, null, force, other, background)
        : await this.client.location(code, when, window, other, force, null, background);
    } catch (e) {
      // a code we couldn't place, refused by RTT: say so in the user's words, not RTT's
      if (!st && e instanceof RttError && !(e instanceof BusyError) && !(e instanceof AuthError)) {
        throw new RttError(`Couldn't find a station called “${station.trim()}”.`);
      }
      throw e;
    }
    const parsed = parseBoard(f.body, { fallbackName: st ? st.name : code, timeFrom: when, timeTo: when + window * 60_000, today: this.clock });
    // the answer may have been fetched for a wider, earlier window: the board shown is this one
    const b: Board = { ...parsed, timeFrom: when, timeTo: when + window * 60_000 };
    // The answer may cover more than is shown (one call fetches FETCH_WINDOW). Keep this window: booked inside it, or
    // booked a little earlier but not gone yet (a late train mustn't vanish because the answer was fetched earlier).
    const until = when + window * 60_000;
    const inWindow = (t: Times) => {
      const bk = booked(t);
      const live = t.actual ?? t.forecast ?? t.estimate ?? bk;
      if (bk == null) return live == null || (live >= when && live < until);
      return bk < until && (bk >= when || (live != null && live >= when && t.actual == null));
    };
    let rows = mode === "arr"
      ? b.rows.filter((r) => !isEmpty(r.arrival) && r.callType !== "ADVERTISED_PICK_UP" && inWindow(r.arrival))
      : b.rows.filter((r) => !isEmpty(r.departure) && r.callType !== "ADVERTISED_SET_DOWN" && inWindow(r.departure));
    let hidden = 0;
    if (!showAll) {
      const before = rows.length;
      rows = rows.filter(forPassengers);
      hidden = before - rows.length;
    }
    return { board: b, rows, station: st, fetched: f, mode, to: toSt, hidden, showAll };
  }

  async service(uniqueId: string, opts: { background?: boolean; force?: boolean; at?: string; to?: string } = {}): Promise<ServiceResult> {
    const { background = false, force = false, at = "" } = opts;
    const uid = uniqueId.trim();
    const i = uid.lastIndexOf(":");
    if (i < 1) throw new RttError("That isn't a train identity (it should look like C05986:2026-09-06).");
    if (parseDate(uid.slice(i + 1)) == null) throw new RttError("That train's date isn't valid.");
    await this.tokenInfo();
    const ttl = background ? this.budget.refreshInterval() : null;
    const f = await this.client.service(uid, !background || force, ttl, force);
    if (!f.body) throw new RttError("Realtime Trains has no details for that train.");
    const now = this.clock();
    const tl = build(parseService(f.body, this.clock), now);
    const formation = formationFor(parseFormations(f.body, tl.service.vehicles), tl.position.fromIndex);
    return { timeline: tl, formation, fetched: f, refreshAfter: pollAfter(tl, now, this.budget.refreshInterval(), at) };
  }
}
