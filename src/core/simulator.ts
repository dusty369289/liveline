// A pretend data.rtt.io for demo mode (no key) and tests. Same paths, same JSON shapes and quirks as the real API.
// test/simulator.test.ts holds it to the frozen golden answers, so demo trains stay the same release after release.
// Routes are real lines with plausible working-timetable times, not a copy of any real timetable. Trains move in real
// time; each gets a delay profile from a hash of its identity.
import type { Http, HttpResponse } from "./http";
import { sha256Hex } from "./sha256";
import { simAllocation } from "./sim-stock";
import { floorMinute, fromLondon, isoLocal, londonOffset, londonParts, type Ms, parseDate, parseTime } from "./time";

interface Loc {
  name: string;
  crs: string | null;
  tiploc: string;
  run: number; // booked minutes from the previous location, for a stopping train
  allowance: number; // seconds of performance allowance in the section after this location
}
const L = (name: string, crs: string | null, tiploc: string, run: number, allowance = 0): Loc => ({ name, crs, tiploc, run, allowance });

const GW: Loc[] = [
  L("London Paddington", "PAD", "PADTON", 0), L("Royal Oak", null, "ROYAOJN", 1.5), L("Westbourne Park", null, "WBRNPKS", 0.5),
  L("Ladbroke Grove", null, "LADBRKG", 1), L("Old Oak Common East Jn", null, "OLDOXRS", 1), L("Acton Main Line", "AML", "ACTONML", 1.5),
  L("Ealing Broadway", "EAL", "EALINGB", 1.5), L("West Ealing", "WEA", "WEALING", 1), L("Hanwell", "HAN", "HANWELL", 1),
  L("Southall", "STL", "STHALL", 2, 60), L("Hayes & Harlington", "HAY", "HAYESAH", 2), L("Airport Junction", null, "AIRPJN", 1),
  L("West Drayton", "WDT", "WDRYTON", 1.5), L("Iver", "IVR", "IVER", 1.5), L("Langley", "LNY", "LANGLEY", 1.5),
  L("Slough", "SLO", "SLOUGH", 2, 60), L("Burnham", "BNM", "BNHAM", 2), L("Taplow", "TAP", "TAPLOW", 1.5),
  L("Maidenhead", "MAI", "MDNHEAD", 1.5), L("Ruscombe", null, "RUSCOMB", 3), L("Twyford", "TWY", "TWYFORD", 1.5, 120),
  L("Reading East Main", null, "RDNGEMJ", 3.5), L("Reading", "RDG", "RDNGSTN", 1.5), L("Reading West Jn", null, "RDNGWJN", 1),
  L("Tilehurst", "TLH", "TILHRST", 2), L("Pangbourne", "PAN", "PANGBRN", 3), L("Goring & Streatley", "GOR", "GORASTR", 3),
  L("Cholsey", "CHO", "CHOLSEY", 3), L("Didcot East Jn", null, "DIDCTEJ", 3.5), L("Didcot Parkway", "DID", "DIDCOTP", 1, 60),
  L("Didcot North Jn", null, "DIDCTNJ", 1.5), L("Appleford", "APF", "APLFORD", 2.5), L("Culham", "CUM", "CULHAM", 2),
  L("Radley", "RAD", "RADLEY", 2), L("Kennington Jn", null, "KNNGTNJ", 3), L("Oxford", "OXF", "OXFD", 3),
];
const SW: Loc[] = [
  L("London Waterloo", "WAT", "WATRLMN", 0), L("Vauxhall", "VXH", "VAUXHLM", 2), L("Queenstown Road (Battersea)", "QRB", "QTRDBAT", 2),
  L("Clapham Junction", "CLJ", "CLPHMJM", 2, 60), L("Earlsfield", "EAD", "EARLFLD", 2), L("Wimbledon", "WIM", "WDON", 3),
  L("Raynes Park", "RAY", "RAYNSPK", 2), L("New Malden", "NEM", "NEWMLDN", 2), L("Berrylands", "BRS", "BRLANDS", 2),
  L("Surbiton", "SUR", "SURBITN", 2, 60), L("Hampton Court Jn", null, "HMPTNJ", 1.5), L("Esher", "ESH", "ESHER", 1.5),
  L("Hersham", "HER", "HERSHAM", 2), L("Walton-on-Thames", "WAL", "WALTON", 2), L("Weybridge", "WYB", "WEYBDGE", 3),
  L("Byfleet & New Haw", "BFN", "BYFLETT", 2), L("West Byfleet", "WBY", "WBYFLET", 2), L("Woking Junction", null, "WOKINGJ", 2.5),
  L("Woking", "WOK", "WOKING", 0.5),
];
const ROUTES: Record<string, Loc[]> = { GW, SW };

interface Pattern {
  route: string;
  opCode: string;
  opName: string;
  prefix: string;
  headcode: string;
  stops: Set<string> | null;
  speed: number;
  minutes: number[];
  firstHour: number;
  lastHour: number;
  vehicles: number;
  end: string | null;
}
const P = (route: string, opCode: string, opName: string, prefix: string, headcode: string, stops: string[] | null,
  speed: number, minutes: number[], vehicles = 8, end: string | null = null): Pattern =>
  ({ route, opCode, opName, prefix, headcode, stops: stops ? new Set(stops) : null, speed, minutes, firstHour: 6, lastHour: 23, vehicles, end });

const PATTERNS: Pattern[] = [
  P("GW", "GW", "Great Western Railway", "C", "1P", ["PADTON", "SLOUGH", "RDNGSTN", "DIDCOTP", "OXFD"], 0.72, [0, 30], 9),
  P("GW", "XR", "Elizabeth Line", "C", "9R", null, 1.0, [12, 42], 9, "RDNGSTN"),
  P("GW", "GW", "Great Western Railway", "C", "2N",
    ["RDNGSTN", "TILHRST", "PANGBRN", "GORASTR", "CHOLSEY", "DIDCOTP", "APLFORD", "CULHAM", "RADLEY", "OXFD"], 1.0, [21], 4),
  P("SW", "SW", "South Western Railway", "W", "1D", ["WATRLMN", "CLPHMJM", "SURBITN", "WOKING"], 0.75, [5, 35], 10),
  P("SW", "SW", "South Western Railway", "W", "2K", null, 1.0, [20, 50], 8),
];

/** Text for a hashed value exactly as the original (Python) implementation wrote it ("True", "1.0"), so the
 * simulated trains stay identical to the golden files. */
function pyStr(v: unknown): string {
  if (typeof v === "boolean") return v ? "True" : "False";
  return String(v);
}
/** int(sha256("|".join(map(str, parts))).hexdigest()[:12], 16): 48 bits, exact in a double. */
export function h(...parts: unknown[]): number {
  return parseInt(sha256Hex(parts.map(pyStr).join("|")).slice(0, 12), 16);
}
/** Plain rounding, 2.5 -> 3 (the simulator's choice; real trains' lateness rounds toward zero in engine.ts). */
export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);
const shr = (x: number, n: number) => Math.floor(x / 2 ** n);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** datetime.isoformat() of a London-zoned instant, e.g. "2026-11-07T14:20:00+00:00". */
export function isoOffset(t: Ms): string {
  const off = londonOffset(t);
  return `${isoLocal(t)}+${pad(Math.floor(off / 60))}:${pad(off % 60)}`;
}
const iso = (t: Ms | null) => (t == null ? null : isoLocal(t));

interface SimPoint {
  loc: Loc;
  calls: boolean;
  arr: Ms | null;
  dep: Ms | null;
  pas: Ms | null;
  trueArr: Ms | null;
  trueDep: Ms | null;
  truePas: Ms | null;
  platform: string | null;
  cancelled: boolean;
  allowAfter: number;
}
export interface SimService {
  identity: string;
  headcode: string;
  runDate: string;
  pattern: Pattern;
  points: SimPoint[];
  profile: string;
  cancelled: boolean;
}

const half = (minutes: number): Ms => roundHalfUp(minutes * 2) * 30_000;

function buildService(pattern: Pattern, start: Ms, reverse: boolean, runDate: string, n: number): SimService {
  let locs = [...ROUTES[pattern.route]];
  if (pattern.end) locs = locs.slice(0, locs.findIndex((l) => l.tiploc === pattern.end) + 1);
  const stops = pattern.stops;
  if (stops) {
    const idx = locs.map((l, i) => (stops.has(l.tiploc) ? i : -1)).filter((i) => i >= 0);
    locs = locs.slice(idx[0], idx[idx.length - 1] + 1);
  }
  let runs = locs.map((l) => l.run);
  let allows = locs.map((l) => l.allowance);
  if (reverse) {
    // section times belong between neighbours, so shift them when the list flips
    locs = [...locs].reverse();
    runs = [0, ...[...runs].reverse().slice(0, -1)];
    allows = [...[...allows].reverse().slice(1), 0];
  }
  const pts: SimPoint[] = [];
  let t = start;
  const mk = (loc: Loc, calls: boolean, arr: Ms | null, dep: Ms | null, pas: Ms | null): SimPoint =>
    ({ loc, calls, arr, dep, pas, trueArr: null, trueDep: null, truePas: null, platform: null, cancelled: false, allowAfter: 0 });
  locs.forEach((loc, i) => {
    const calls = loc.crs != null && (stops == null || stops.has(loc.tiploc));
    if (i > 0) {
      const share = calls || pts[pts.length - 1].calls ? 1.0 : pattern.speed;
      t += half(runs[i] * share + allows[i - 1] / 60);
    }
    if (i === 0) pts.push(mk(loc, true, null, t, null));
    else if (i === locs.length - 1) pts.push(mk(loc, true, t, null, null));
    else if (calls) {
      const dwell = ["RDG", "CLJ", "SUR", "DID", "SLO"].includes(loc.crs!) ? 60_000 : 30_000;
      pts.push(mk(loc, true, t, t + dwell, null));
      t += dwell;
    } else pts.push(mk(loc, false, null, null, t));
  });
  const ident = `${pattern.prefix}${pad((h(pattern.headcode, isoOffset(start), reverse) % 90000) + 10000, 5)}`;
  const letter = pattern.headcode[1];
  const hcLetter = reverse ? String.fromCharCode(letter.charCodeAt(0) + 1) : letter;
  const hc = `${pattern.headcode[0]}${hcLetter}${pad(n % 100)}`;
  pts.forEach((p, i) => {
    p.allowAfter = i < pts.length - 1 ? allows[i] : 0;
    if (p.calls) {
      p.platform = !["WOK", "OXF"].includes(p.loc.crs!)
        ? String(1 + (h(ident, i) % 4) + (reverse ? 4 : 0))
        : String(1 + (h(ident, i) % 2) + (reverse ? 2 : 0));
    }
  });
  const svc: SimService = { identity: ident, headcode: hc, runDate, pattern, points: pts, profile: "", cancelled: false };
  applyProfile(svc);
  return svc;
}

function applyProfile(s: SimService): void {
  const r = h("profile", s.identity, s.runDate) % 100;
  const profile = r < 52 ? "on-time" : r < 74 ? "late-recovering" : r < 86 ? "late-growing" : r < 95 ? "held" : r < 98 ? "cancelled" : "part-cancelled";
  s.profile = profile;
  let startDelay = 0;
  if (profile === "late-recovering") startDelay = 3 + (h("d", s.identity) % 7);
  else if (profile === "late-growing") startDelay = 1 + (h("d", s.identity) % 3);
  const heldAt = 2 + (h("held", s.identity) % Math.max(s.points.length - 3, 1));
  const heldFor = 3 + (h("hf", s.identity) % 6);
  let delay = startDelay * 60;
  const seed = h("j", s.identity);
  s.points.forEach((p, i) => {
    const noise = (shr(seed, i % 40) % 4) * 10 - 15; // -15..+15 s
    if (profile === "late-growing" && i > 0) delay += 25 + (shr(seed, i % 30) % 2) * 30;
    if (profile === "held" && i === heldAt) delay += heldFor * 60;
    const d = Math.max(delay + noise, -50) * 1000;
    if (p.calls) {
      if (p.arr != null) p.trueArr = p.arr + d;
      if (p.dep != null) {
        // never leave early; a late train uses spare dwell to recover a little
        p.trueDep = p.arr != null ? Math.max(p.dep, (p.trueArr ?? p.dep) + 25_000) : p.dep + Math.max(d, 0);
        delay = (p.trueDep - p.dep) / 1000;
      }
    } else p.truePas = p.pas! + d;
    if (profile === "late-recovering" && i > 0) delay = Math.max(delay - s.points[i - 1].allowAfter * 0.8 - 15, 0);
  });
  if (profile === "cancelled") {
    s.cancelled = true;
    for (const p of s.points) p.cancelled = true;
  } else if (profile === "part-cancelled") {
    const cut = Math.floor((s.points.length * 2) / 3);
    for (const p of s.points.slice(cut)) p.cancelled = true;
  }
}

export class Timetable {
  private days = new Map<string, SimService[]>();

  day(d: string): SimService[] {
    let out = this.days.get(d);
    if (!out) {
      out = [];
      const [y, mo, dd] = d.split("-").map(Number);
      PATTERNS.forEach((pat, pi) => {
        let n = pi * 20;
        for (let hour = pat.firstHour; hour <= pat.lastHour; hour++) {
          for (const minute of pat.minutes) {
            n += 1;
            const start = fromLondon(y, mo, dd, hour, minute);
            for (const reverse of [false, true]) out!.push(buildService(pat, start + (reverse ? 420_000 : 0), reverse, d, n));
          }
        }
      });
      this.days.set(d, out);
      if (this.days.size > 4) this.days.delete(this.days.keys().next().value!); // a long-running app keeps a few days
    }
    return out;
  }

  find(identity: string, d: string): SimService | undefined {
    return this.day(d).find((s) => s.identity === identity);
  }
}

const REPORT_LAG = 30_000;

/** `forecasting`: false for a train on a later day, which real RTT doesn't forecast (it isn't activated yet). */
function event(planned: Ms | null, truth: Ms | null, now: Ms, advertised: boolean, delayNow: number, cancelled: boolean,
  isDep: boolean, forecasting: boolean): Record<string, unknown> | null {
  if (planned == null) return null;
  const ev: Record<string, unknown> = { scheduleInternal: iso(planned) };
  if (advertised) ev.scheduleAdvertised = iso(floorMinute(planned));
  if (cancelled) {
    ev.isCancelled = true;
    return ev;
  }
  if (truth != null && now >= truth + REPORT_LAG) {
    const act = floorMinute(truth + 30_000); // reports are to the nearest minute
    ev.realtimeActual = iso(act);
    ev.realtimeInternalLateness = roundHalfUp((act - planned) / 60_000);
    if (advertised) ev.realtimeAdvertisedLateness = roundHalfUp((act - floorMinute(planned)) / 60_000);
  } else if (advertised && forecasting) {
    // RTT-style forecast at calls: current delay carried forward, never leaving early
    ev.realtimeForecast = iso(floorMinute(planned + Math.max(delayNow, isDep ? 0 : -60) * 1000));
  }
  ev.isCancelled = false;
  return ev;
}

const dayOf = (t: Ms) => {
  const p = londonParts(t);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
};
const addDays = (d: string, n: number) => dayOf(parseDate(d)! + n * 86_400_000 + 12 * 3_600_000);

export class SimTransport implements Http {
  readonly requests: Array<[string, Record<string, string>]> = [];
  private times: Ms[] = [];

  constructor(
    public clock: () => Ms = Date.now,
    readonly tt: Timetable = new Timetable(),
    private stationName: (crs: string) => string | null = () => null,
    public limitHour = 100,
  ) {}

  private headers(): Record<string, string> {
    const now = this.clock();
    const out: Record<string, string> = {};
    for (const [dim, secs, limit] of [["minute", 60, 10], ["hour", 3600, this.limitHour], ["day", 86400, 1000]] as const) {
      const used = this.times.filter((t) => now - t < secs * 1000).length;
      out[`x-ratelimit-limit-${dim}`] = String(limit);
      out[`x-ratelimit-remaining-${dim}`] = String(Math.max(limit - used, 0));
    }
    return out;
  }

  async get(path: string, params: Record<string, string>): Promise<HttpResponse> {
    return this.getSync(path, params);
  }

  getSync(path: string, params: Record<string, string>): HttpResponse {
    this.requests.push([path, { ...params }]);
    if (this.requests.length > 1000) this.requests.shift(); // recent only: a demo can run for weeks
    this.times.push(this.clock());
    if (this.times.length > 2000) this.times.splice(0, 1000);
    const hd = this.headers();
    if (path === "/api/info") {
      return { status: 200, headers: hd, body: { api_version: "2026-07-25", credentials: { entitlements: [], historyRestriction: true,
        historyRestrictToDays: 14, namespaceRestriction: true, namespacesAvailable: ["gb-nr"] } } };
    }
    if (path === "/gb-nr/location") return this.location(params, hd);
    if (path === "/gb-nr/service") return this.service(params, hd);
    return { status: 404, headers: hd, body: { error: "Not found" } };
  }

  private delayBefore(s: SimService, idx: number, now: Ms): number {
    let delay = 0;
    for (const p of s.points.slice(0, idx)) {
      for (const [pl, tr] of [[p.dep, p.trueDep], [p.pas, p.truePas], [p.arr, p.trueArr]]) {
        if (pl != null && tr != null && now >= tr + REPORT_LAG) {
          delay = (tr - pl) / 1000;
          break;
        }
      }
    }
    return delay;
  }

  private status(s: SimService, i: number, now: Ms): string | null {
    const p = s.points[i];
    if (s.cancelled || p.cancelled || !p.calls) return null;
    if (p.trueArr != null && p.trueArr <= now && (p.trueDep == null || now < p.trueDep)) {
      return p.trueDep == null || now < p.trueDep - 30_000 ? "AT_PLATFORM" : "DEPART_READY";
    }
    if (p.trueArr != null && p.trueArr - 120_000 <= now && now < p.trueArr) return "APPROACHING";
    if (p.trueDep != null && p.trueDep <= now && now < p.trueDep + 40_000) return "DEPARTING";
    return null;
  }

  private temporal(s: SimService, i: number, now: Ms): Record<string, unknown> {
    const p = s.points[i];
    const cancelled = s.cancelled || p.cancelled;
    const delay = this.delayBefore(s, i + 1, now);
    const fc = s.runDate <= dayOf(now); // a later day's train isn't forecast, as with real RTT
    const t: Record<string, unknown> = {};
    if (p.calls) {
      if (p.arr != null) t.arrival = event(p.arr, p.trueArr, now, true, delay, cancelled, false, fc);
      if (p.dep != null) t.departure = event(p.dep, p.trueDep, now, true, delay, cancelled, true, fc);
      t.scheduledCallType = "ADVERTISED_OPEN";
      t.realtimeCallType = cancelled ? null : "ADVERTISED_OPEN";
      t.displayAs = cancelled ? "CANCELLED" : "CALL";
    } else {
      t.pass = event(p.pas, p.truePas, now, false, delay, cancelled, false, fc);
      t.scheduledCallType = null;
      t.realtimeCallType = null;
      // both forms seen: "PASS", and null meaning a pass
      t.displayAs = cancelled ? "CANCELLED" : h(p.loc.tiploc) % 2 ? "PASS" : null;
    }
    const st = this.status(s, i, now);
    if (st) t.status = st;
    t.isInterpolated = false;
    return t;
  }

  private meta(s: SimService, i: number, now: Ms, detailed: boolean): Record<string, unknown> {
    const p = s.points[i];
    const m: Record<string, unknown> = {};
    if (p.platform) {
      const near = p.trueArr ?? p.trueDep;
      m.platform = near != null && now >= near - 600_000 ? { planned: p.platform, actual: p.platform } : { planned: p.platform, forecast: p.platform };
    }
    m.numberOfVehicles = s.pattern.vehicles;
    m.allocationIndex = 0;
    if (detailed) m.allowances = { engineering: null, pathing: null, performance: p.allowAfter || null };
    return m;
  }

  private scheduleMeta(s: SimService, board: boolean): Record<string, unknown> {
    const m: Record<string, unknown> = {
      uniqueIdentity: `gb-nr:${s.identity}:${s.runDate}`, namespace: "gb-nr", identity: s.identity, departureDate: s.runDate,
      operator: { code: s.pattern.opCode, name: s.pattern.opName }, modeType: "TRAIN", inPassengerService: true,
    };
    if (!board) m.trainReportingIdentity = s.headcode; // absent on real free board rows
    return m;
  }

  private pair(p: SimPoint, departing: boolean) {
    const t = departing ? p.dep : p.arr;
    return { location: { description: p.loc.name, longCodes: [p.loc.tiploc] },
      temporalData: { scheduleInternal: iso(t), scheduleAdvertised: t != null ? iso(floorMinute(t)) : null } };
  }

  private resolve(code: string): [string, string | null, string | null] {
    const c = code.toUpperCase();
    for (const route of Object.values(ROUTES)) for (const l of route) if (c === l.crs || c === l.tiploc) return [l.name, l.crs, l.tiploc];
    const name = this.stationName(c);
    if (name) return [name, c, null];
    return [c, c.length === 3 ? c : null, null];
  }

  private location(params: Record<string, string>, hd: Record<string, string>): HttpResponse {
    const code = params.code ?? "";
    if (!code) return { status: 400, headers: hd, body: { error: "code is required" } };
    const [name, crs, tiploc] = this.resolve(code);
    // like RTT: a code it doesn't know is a 400, not an empty board
    if (name === code.toUpperCase() && !tiploc && code.length !== 3) return { status: 400, headers: hd, body: { error: "issue with one or more requested locations" } };
    const now = this.clock();
    const tf = (params.timeFrom ? parseTime(params.timeFrom) : null) ?? now;
    const window = parseInt(params.timeWindow ?? "60", 10);
    const tt = tf + window * 60_000;
    const filterTo = (params.filterTo ?? "").toUpperCase() || null;
    const filterFrom = (params.filterFrom ?? "").toUpperCase() || null;
    const rows: Array<[Ms, SimService, number]> = [];
    const days = [...new Set([addDays(dayOf(tf), -1), dayOf(tf), dayOf(tt)])].sort();
    for (const d of days) {
      for (const s of this.tt.day(d)) {
        s.points.forEach((p, i) => {
          if (!p.calls || (crs && p.loc.crs !== crs && p.loc.tiploc !== tiploc) || (!crs && p.loc.tiploc !== tiploc)) return;
          const when = (p.dep ?? p.arr)!;
          if (!(tf <= when && when < tt)) return;
          if (filterTo && !s.points.slice(i + 1).some((q) => q.calls && (filterTo === q.loc.crs || filterTo === q.loc.tiploc))) return;
          if (filterFrom && !s.points.slice(0, i).some((q) => q.calls && (filterFrom === q.loc.crs || filterFrom === q.loc.tiploc))) return;
          rows.push([when, s, i]);
        });
      }
    }
    rows.sort((a, b) => a[0] - b[0]);
    if (!rows.length) return { status: 204, headers: hd, body: null };
    const query = {
      location: { namespace: "gb-nr", description: name, shortCodes: crs ? [crs] : [], longCodes: tiploc ? [`gb-nr:${tiploc}`] : [] },
      timeFrom: isoOffset(tf), timeTo: isoOffset(tt), detailed: false,
    };
    const services = rows.map(([, s, i]) => ({
      temporalData: this.temporal(s, i, now), locationMetadata: this.meta(s, i, now, false), scheduleMetadata: this.scheduleMeta(s, true),
      origin: [this.pair(s.points[0], true)], destination: [this.pair(s.points[s.points.length - 1], false)],
    }));
    return { status: 200, headers: hd, body: { systemStatus: { realtimeNetworkRail: "OK", rttCore: "OK" }, query, services } };
  }

  private service(params: Record<string, string>, hd: Record<string, string>): HttpResponse {
    const parts = (params.uniqueIdentity ?? "").split(":");
    if (parts.length < 2) return { status: 400, headers: hd, body: { error: "uniqueIdentity must be identity:date" } };
    const [identity, d] = parts.slice(-2);
    if (parseDate(d) == null) return { status: 400, headers: hd, body: { error: "bad date" } };
    const s = this.tt.find(identity, d);
    if (!s) return { status: 404, headers: hd, body: null };
    const now = this.clock();
    const locations = s.points.map((p, i) => ({
      temporalData: this.temporal(s, i, now), locationMetadata: this.meta(s, i, now, true),
      location: { namespace: "gb-nr", description: p.loc.name, shortCodes: p.loc.crs ? [p.loc.crs] : [], longCodes: [p.loc.tiploc] },
    }));
    let reasons: unknown[] = [];
    if (["late-recovering", "late-growing", "held"].includes(s.profile) && this.delayBefore(s, s.points.length, now) >= 180) {
      reasons = [{ type: "DELAY", code: "XA", system: "TRUST",
        shortText: s.profile === "held" ? "a signalling problem" : "a late-running train ahead", longText: null }];
    }
    if (s.cancelled) reasons = [{ type: "CANCEL", code: "M8", system: "TRUST", shortText: "a fault on this train", longText: null }];
    return { status: 200, headers: hd, body: {
      systemStatus: { realtimeNetworkRail: "OK", rttCore: "OK" },
      query: { uniqueIdentity: `gb-nr:${s.identity}:${s.runDate}` },
      service: { scheduleMetadata: this.scheduleMeta(s, false), locations,
        allocationData: [simAllocation(s.pattern.headcode, s.identity, s.pattern.vehicles)],
        origin: [this.pair(s.points[0], true)], destination: [this.pair(s.points[s.points.length - 1], false)], reasons },
    } };
  }
}
