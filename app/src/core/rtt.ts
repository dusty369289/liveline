// RTT client: token handling (access or refresh), caching, and the allowance, over any Http.
// Port of src/liveline/sources/rtt.py. On the phone it holds one key: its owner's.
import { Budget } from "./budget";
import { type Http, type HttpResponse, NetworkError } from "./http";
import { sha256Hex } from "./sha256";
import { hm, isoLocal, type Ms } from "./time";

export class RttError extends Error {}
/** The key is missing, wrong, expired or revoked. */
export class AuthError extends RttError {}
/** Not the user's fault and not permanent: out of allowance, asked to wait, or RTT unreachable. Try again soon. */
export class BusyError extends RttError {}
/** Busy because this device has no connection: retried the same way, but named honestly. */
export class OfflineError extends BusyError {}

export interface Fetched {
  body: unknown; // null for "no services" (204)
  fetchedAt: Ms;
  stale: boolean; // served from cache because we couldn't (or shouldn't) refetch
  note: string | null; // why it's stale
}

export interface TokenInfo {
  entitlements: string[];
  apiVersion: string | null;
  historyDays: number | null;
  kind: "access" | "refresh" | "unknown";
}
export const isDetailed = (i: TokenInfo | null) => !!i && i.entitlements.includes("allowDetailed");

/** Where the short-life access token and what the key may do are remembered between app launches. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const STATE_KEY = "rtt.access";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function info(body: unknown, kind: TokenInfo["kind"]): TokenInfo {
  const cred = isObj(body) && isObj(body.credentials) ? body.credentials : {};
  return {
    entitlements: Array.isArray(cred.entitlements) ? cred.entitlements.map(String) : [],
    apiVersion: isObj(body) && body.api_version ? String(body.api_version) : null,
    historyDays: cred.historyRestriction && cred.historyRestrictToDays != null ? Number(cred.historyRestrictToDays) : null,
    kind,
  };
}

/** Stop using a short-life access token a minute before it expires, or after 10 minutes if we can't tell. */
function until(validUntil: unknown, now: Ms): Ms {
  const t = typeof validUntil === "string" ? Date.parse(validUntil) : NaN;
  return Number.isFinite(t) ? t - 60_000 : now + 600_000;
}

export interface ClientOptions {
  boardTtl?: number; // seconds
  serviceTtl?: number;
  minRefreshAge?: number; // a forced refresh never refetches anything younger than this
  maxCached?: number;
}

export class RttClient {
  info: TokenInfo | null = null;
  private access: string | null = null;
  private accessUntil: Ms | null = null;
  private cache = new Map<string, Fetched>();
  private inflight = new Map<string, Promise<Fetched>>();
  readonly boardTtl: number;
  readonly serviceTtl: number;
  readonly minRefreshAge: number;
  readonly maxCached: number;
  private loaded = false;

  constructor(
    private http: Http,
    private token: string | null,
    readonly budget: Budget,
    private clock: () => Ms = Date.now,
    private store: KeyValueStore | null = null,
    opts: ClientOptions = {},
  ) {
    this.boardTtl = opts.boardTtl ?? 60;
    this.serviceTtl = opts.serviceTtl ?? 30;
    this.minRefreshAge = opts.minRefreshAge ?? 15;
    this.maxCached = opts.maxCached ?? 60;
  }

  get hasToken() {
    return !!this.token;
  }

  /** The last 5 characters, so a person can tell which key is in use without it being shown. */
  get tokenHint(): string | null {
    return this.token && this.token.length > 12 ? `…${this.token.slice(-5)}` : null;
  }

  private fingerprint() {
    return this.token ? sha256Hex(this.token).slice(0, 16) : null;
  }

  /** Reuse the access token from the last launch, so opening the app doesn't cost 3 calls. */
  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.store || !this.token) return;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse((await this.store.get(STATE_KEY)) ?? "null");
    } catch {
      return;
    }
    if (!isObj(d) || d.for !== this.fingerprint()) return;
    const u = typeof d.until === "number" ? d.until : null;
    if (d.kind === "refresh" && (u == null || u <= this.clock())) return;
    this.info = {
      entitlements: Array.isArray(d.entitlements) ? d.entitlements.map(String) : [],
      apiVersion: d.apiVersion ? String(d.apiVersion) : null,
      historyDays: typeof d.historyDays === "number" ? d.historyDays : null,
      kind: d.kind === "access" || d.kind === "refresh" ? d.kind : "unknown",
    };
    if (this.info.kind === "refresh" && typeof d.access === "string") [this.access, this.accessUntil] = [d.access, u];
  }

  /** What the last launch learned about the key, without any call. Null if nothing usable is saved. */
  async restore(): Promise<TokenInfo | null> {
    await this.load();
    return this.info;
  }

  private async save(): Promise<void> {
    if (!this.store) return;
    if (!this.token || !this.info) {
      await this.store.remove(STATE_KEY);
      return;
    }
    const d: Record<string, unknown> = { for: this.fingerprint(), kind: this.info.kind, entitlements: this.info.entitlements,
      apiVersion: this.info.apiVersion, historyDays: this.info.historyDays };
    if (this.info.kind === "refresh" && this.access) Object.assign(d, { access: this.access, until: this.accessUntil });
    await this.store.set(STATE_KEY, JSON.stringify(d));
  }

  private async raw(path: string, params: Record<string, string>, token: string | null): Promise<HttpResponse> {
    this.budget.spend();
    let r: HttpResponse;
    try {
      r = await this.http.get(path, params, token);
    } catch (e) {
      throw new OfflineError(`Couldn't reach Realtime Trains${e instanceof NetworkError ? "" : " (network)"}. Check your connection.`);
    }
    this.budget.observe(r.status, r.headers);
    return r;
  }

  /** Try the key as an access token, then as a refresh token. Costs 1 to 3 calls. */
  async checkToken(): Promise<TokenInfo> {
    if (!this.token) throw new AuthError("No Realtime Trains key is set.");
    this.loaded = true;
    const r = await this.raw("/api/info", {}, this.token);
    if (r.status === 200 && isObj(r.body)) {
      this.info = info(r.body, "access");
      await this.save();
      return this.info;
    }
    const r2 = await this.raw("/api/get_access_token", {}, this.token);
    if (r2.status === 200 && isObj(r2.body) && r2.body.token) {
      this.access = String(r2.body.token);
      this.accessUntil = until(r2.body.validUntil, this.clock());
      const r3 = await this.raw("/api/info", {}, this.access);
      this.info = info(isObj(r3.body) ? r3.body : {}, "refresh");
      if (!this.info.entitlements.length && Array.isArray(r2.body.entitlements)) this.info.entitlements = r2.body.entitlements.map(String);
      await this.save();
      return this.info;
    }
    if (r.status === 429 || r2.status === 429) throw new BusyError("Realtime Trains asked us to slow down. Try again shortly.");
    throw new AuthError(`Realtime Trains refused the key (HTTP ${r.status}). Check it in api-portal.rtt.io.`);
  }

  private async bearer(): Promise<string> {
    if (!this.token) throw new AuthError("No Realtime Trains key is set.");
    await this.load();
    const now = this.clock();
    if (this.access && (this.accessUntil == null || now < this.accessUntil)) return this.access;
    if (!this.info || this.info.kind === "unknown") await this.checkToken();
    if (this.info && this.info.kind === "access") {
      [this.access, this.accessUntil] = [this.token, null];
      return this.token;
    }
    if (this.access && this.accessUntil != null && now < this.accessUntil) return this.access;
    const r = await this.raw("/api/get_access_token", {}, this.token);
    if (r.status !== 200 || !isObj(r.body) || !r.body.token) {
      throw new AuthError("Realtime Trains didn't accept the key. Check it in api-portal.rtt.io.");
    }
    this.access = String(r.body.token);
    this.accessUntil = until(r.body.validUntil, now);
    await this.save();
    return this.access;
  }

  private stale(cached: Fetched, note: string): Fetched {
    return { ...cached, stale: true, note };
  }

  private async get(key: string, path: string, params: Record<string, string>, ttl: number, interactive: boolean,
    force = false): Promise<Fetched> {
    const running = this.inflight.get(key);
    if (running) return running; // the same question twice at once costs one call
    const p = this.fetchOne(key, path, params, ttl, interactive, force).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async fetchOne(key: string, path: string, params: Record<string, string>, ttl: number, interactive: boolean,
    force: boolean): Promise<Fetched> {
    const now = this.clock();
    const cached = this.cache.get(key);
    const age = cached ? (now - cached.fetchedAt) / 1000 : null;
    if (cached && force && age! < this.minRefreshAge) return cached; // pressing refresh again costs nothing
    if (cached && !force && age! < ttl) return cached;
    if (!this.budget.canSpend(interactive)) {
      if (cached) return this.stale(cached, "Saving the hourly allowance");
      const st = this.budget.state();
      if (st.blockedUntil != null) throw new BusyError(`Realtime Trains asked us to wait until ${hm(st.blockedUntil)}.`);
      throw new BusyError("The Realtime Trains allowance is used up for now. Try again in a few minutes.");
    }
    let r: HttpResponse;
    try {
      r = await this.raw(path, params, await this.bearer());
    } catch (e) {
      if (cached && e instanceof BusyError) return this.stale(cached, "Realtime Trains didn't answer");
      throw e;
    }
    if (r.status === 401) {
      this.access = null;
      if (this.info && this.info.kind !== "refresh") this.info = null;
      throw new AuthError("Realtime Trains refused the key. It may have expired or been revoked.");
    }
    if (r.status === 429) {
      if (cached) return this.stale(cached, "Realtime Trains asked us to slow down");
      throw new BusyError("Realtime Trains asked us to slow down. Try again shortly.");
    }
    let f: Fetched;
    if (r.status === 204) f = { body: null, fetchedAt: now, stale: false, note: null };
    else if (r.status === 200) f = { body: r.body, fetchedAt: now, stale: false, note: null };
    else if (r.status === 404) throw new RttError("Realtime Trains doesn't know that train.");
    else if (r.status === 400) {
      const msg = isObj(r.body) && r.body.error ? String(r.body.error) : "bad request";
      throw new RttError(`Realtime Trains couldn't answer that: ${msg}.`);
    } else {
      if (cached) return this.stale(cached, `Realtime Trains error ${r.status}`);
      throw new BusyError(`Realtime Trains had a problem (HTTP ${r.status}).`);
    }
    this.cache.set(key, f);
    if (this.cache.size > this.maxCached) {
      const drop = this.cache.size - this.maxCached + Math.max(Math.floor(this.maxCached / 5), 1);
      [...this.cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt).slice(0, drop).forEach(([k]) => this.cache.delete(k));
    }
    return f;
  }

  async location(code: string, timeFrom: Ms, windowMin = 60, filterTo: string | null = null, force = false,
    filterFrom: string | null = null): Promise<Fetched> {
    await this.load();
    const params: Record<string, string> = { code: code.toUpperCase(), timeFrom: isoLocal(timeFrom), timeWindow: String(windowMin) };
    if (filterTo) params.filterTo = filterTo.toUpperCase();
    if (filterFrom) params.filterFrom = filterFrom.toUpperCase();
    if (isDetailed(this.info)) params.detailed = "true";
    // keyed to the minute, so "now" asked twice in a minute shares one answer
    const key = ["loc", params.code, params.timeFrom.slice(0, 16), windowMin, params.filterTo ?? "", params.filterFrom ?? ""].join("|");
    return this.get(key, "/gb-nr/location", params, this.boardTtl, true, force);
  }

  async service(uniqueId: string, interactive = true, ttl: number | null = null, force = false): Promise<Fetched> {
    await this.load();
    const params: Record<string, string> = { uniqueIdentity: uniqueId };
    if (isDetailed(this.info)) params.detailed = "true";
    return this.get(`svc|${uniqueId}`, "/gb-nr/service", params, ttl ?? this.serviceTtl, interactive, force);
  }
}
