// RTT next-generation JSON to models. Tolerant by design: every field may be missing (AGENTS.md lists the quirks).
// test/parity.test.ts holds it to the frozen golden answers (test/golden/README.md).
import {
  type Allowances,
  type Board,
  type BoardRow,
  type Display,
  DISPLAYS,
  type Endpoint,
  isEmpty,
  booked,
  type Point,
  type Reason,
  type Service,
  type SystemStatus,
  type Times,
  emptyTimes,
} from "./models";
import { isoDate, type Ms, parseTime } from "./time";

type Json = Record<string, unknown>;
const ADVERTISED = new Set(["ADVERTISED_OPEN", "ADVERTISED_SET_DOWN", "ADVERTISED_PICK_UP"]);

// Reading untrusted JSON: also used by formation.ts
export const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
export const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
export const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const truthy = (v: unknown) => !!v && v !== 0;

function times(raw: unknown): Times {
  if (!isObj(raw)) return emptyTimes();
  return {
    advertised: parseTime(raw.scheduleAdvertised),
    internal: parseTime(raw.scheduleInternal),
    forecast: parseTime(raw.realtimeForecast),
    estimate: parseTime(raw.realtimeEstimate),
    actual: parseTime(raw.realtimeActual),
    noReport: truthy(raw.realtimeNoReport),
    cancelled: truthy(raw.isCancelled),
  };
}

const stripNs = (code: string) => (code.includes(":") ? code.split(":").slice(1).join(":") : code);

function first(codes: unknown): string | null {
  return Array.isArray(codes) && codes.length && typeof codes[0] === "string" ? stripNs(codes[0]) : null;
}

function display(raw: unknown): Display {
  if (!raw) return "PASS";
  return DISPLAYS.includes(raw as Display) ? (raw as Display) : "CALL";
}

function platform(meta: Json): [string | null, boolean, boolean] {
  const p = meta.platform;
  if (!isObj(p)) return [null, false, false];
  const shown = p.actual || p.forecast || p.planned;
  const changed = !!(p.planned && shown && String(shown) !== String(p.planned));
  return [shown == null || shown === "" ? null : String(shown), truthy(p.actual), changed];
}

function reasons(raw: unknown): Reason[] {
  if (!Array.isArray(raw)) return [];
  const out: Reason[] = [];
  for (const r of raw) {
    if (!isObj(r)) continue;
    const text = r.longText || r.shortText;
    if (text) out.push({ kind: String(r.type || "DELAY"), text: String(text) });
  }
  return out;
}

function endpoints(raw: unknown): Endpoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((e) => {
    const loc = obj(e.location);
    const t = obj(e.temporalData);
    return {
      name: String(loc.description || "Unknown"),
      tiploc: first(loc.longCodes),
      time: parseTime(t.scheduleAdvertised) ?? parseTime(t.scheduleInternal),
    };
  });
}

function systemStatus(raw: unknown): SystemStatus {
  const r = obj(raw);
  return { networkRail: String(r.realtimeNetworkRail || "OK"), core: String(r.rttCore || "OK") };
}

/** The feed's state from any answer (a board's is parsed into Board; a service's is kept beside Service, not on it). */
export const parseSystemStatus = (body: unknown): SystemStatus => systemStatus(obj(body).systemStatus);

function unique(meta: Json, today: () => Ms): [string, string, string] {
  let identity = String(meta.identity || "");
  let run = str(meta.departureDate);
  const uid = meta.uniqueIdentity;
  if (!(identity && run) && typeof uid === "string") {
    const parts = uid.split(":");
    if (parts.length >= 3) {
      identity = identity || parts[parts.length - 2];
      run = run || parts[parts.length - 1];
    }
  }
  const runDate = run && /^\d{4}-\d{2}-\d{2}$/.test(run) ? run : isoDate(today());
  return [`${identity}:${runDate}`, identity, runDate];
}

function pa(meta: Json, key: string): string | null {
  const v = meta[key];
  return isObj(v) ? str(v.actual || v.forecast || v.planned) : null;
}

const toInt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

export function parsePoint(raw: Json): Point {
  const t = obj(raw.temporalData);
  const meta = obj(raw.locationMetadata);
  const loc = obj(raw.location);
  const disp = display(t.displayAs);
  const arrival = times(t.arrival);
  const departure = times(t.departure);
  const passing = times(t.pass);
  const callType = str(t.realtimeCallType) ?? str(t.scheduledCallType);
  let isPass = disp === "PASS" || (isEmpty(arrival) && isEmpty(departure) && !isEmpty(passing));
  if ((disp === "CANCELLED" || disp === "DIVERTED") && !isEmpty(passing) && isEmpty(arrival)) isPass = true;
  const [plat, confirmed, changed] = platform(meta);
  const allow = obj(meta.allowances);
  const allowances: Allowances = {
    engineering: toInt(allow.engineering || 0),
    pathing: toInt(allow.pathing || 0),
    performance: toInt(allow.performance || 0),
  };
  return {
    name: String(loc.description || "Unknown"),
    crs: first(loc.shortCodes),
    tiploc: first(loc.longCodes),
    kind: isPass ? "pass" : "call",
    display: disp,
    arrival,
    departure,
    passing,
    platform: plat,
    platformConfirmed: confirmed,
    platformChanged: changed,
    status: str(t.status),
    public: callType ? ADVERTISED.has(callType) : !isPass,
    requestStop: truthy(meta.isRequestStop),
    interpolated: truthy(t.isInterpolated),
    allowances,
    line: pa(meta, "line"),
    path: pa(meta, "path"),
  };
}

export function parseService(body: unknown, today: () => Ms = Date.now): Service {
  const s = obj(obj(body).service);
  const meta = obj(s.scheduleMetadata);
  const [uniqueId, identity, runDate] = unique(meta, today);
  const rawLocs = Array.isArray(s.locations) ? s.locations.filter(isObj) : [];
  const points = rawLocs.map(parsePoint);
  let vehicles: unknown = null;
  const units: string[] = [];
  let leading: unknown = null;
  const alloc = s.allocationData;
  if (Array.isArray(alloc) && alloc.length && isObj(alloc[0])) {
    vehicles = alloc[0].passengerVehicles ?? null;
    leading = alloc[0].leadingClass ?? null;
    const items = Array.isArray(alloc[0].allocationItems) ? alloc[0].allocationItems : [];
    for (const item of items) {
      if (isObj(item) && item.identity && !item.identitySuppressed) units.push(String(item.identity));
    }
  }
  if (vehicles == null) {
    for (const p of rawLocs) {
      const n = obj(p.locationMetadata).numberOfVehicles;
      if (n) {
        vehicles = n;
        break;
      }
    }
  }
  let origins = endpoints(s.origin);
  let destinations = endpoints(s.destination);
  if (!origins.length && points.length) {
    origins = [{ name: points[0].name, tiploc: points[0].tiploc, time: booked(points[0].departure) }];
  }
  if (!destinations.length && points.length) {
    const last = points[points.length - 1];
    destinations = [{ name: last.name, tiploc: last.tiploc, time: booked(last.arrival) }];
  }
  const op = obj(meta.operator);
  let branding: string | null = null;
  for (const p of rawLocs) {
    const b = obj(p.locationMetadata).stockBranding;
    if (b) {
      branding = String(b);
      break;
    }
  }
  return {
    uniqueId,
    identity,
    runDate,
    headcode: str(meta.trainReportingIdentity),
    operatorCode: String(op.code || ""),
    operatorName: String(op.name || op.code || "Unknown operator"),
    mode: String(meta.modeType || "TRAIN"),
    passenger: meta.inPassengerService !== false,
    origins,
    destinations,
    points,
    reasons: reasons(s.reasons),
    vehicles: vehicles ? toInt(vehicles) : null,
    units,
    leadingClass: leading ? String(leading) : null,
    branding,
    stp: str(meta.stpIndicator),
  };
}

/** `body` is null for a 204 (no services). */
export function parseBoard(
  body: unknown,
  opts: { fallbackName: string; timeFrom: Ms; timeTo: Ms; today?: () => Ms },
): Board {
  const b = obj(body);
  const q = obj(b.query);
  const loc = obj(q.location);
  const rows: BoardRow[] = [];
  for (const raw of Array.isArray(b.services) ? b.services : []) {
    if (!isObj(raw)) continue;
    const t = obj(raw.temporalData);
    const meta = obj(raw.scheduleMetadata);
    const lm = obj(raw.locationMetadata);
    const [uniqueId, identity, runDate] = unique(meta, opts.today ?? Date.now);
    const [plat, confirmed, changed] = platform(lm);
    const op = obj(meta.operator);
    const origins = endpoints(raw.origin);
    const dests = endpoints(raw.destination);
    const veh = lm.numberOfVehicles;
    rows.push({
      uniqueId,
      identity,
      runDate,
      headcode: str(meta.trainReportingIdentity),
      operatorCode: String(op.code || ""),
      operatorName: String(op.name || op.code || ""),
      mode: String(meta.modeType || "TRAIN"),
      origin: origins.map((o) => o.name).join(" & ") || "Unknown",
      destination: dests.map((o) => o.name).join(" & ") || "Unknown",
      arrival: times(t.arrival),
      departure: times(t.departure),
      platform: plat,
      platformConfirmed: confirmed,
      platformChanged: changed,
      display: t.displayAs ? display(t.displayAs) : "CALL",
      status: str(t.status),
      vehicles: veh == null ? null : toInt(veh),
      passenger: meta.inPassengerService !== false,
      callType: str(t.realtimeCallType) ?? str(t.scheduledCallType),
      branding: str(lm.stockBranding),
      line: pa(lm, "line"),
      stp: str(meta.stpIndicator),
      reasons: reasons(raw.reasons),
    });
  }
  return {
    stationName: String(loc.description || opts.fallbackName),
    stationCrs: first(loc.shortCodes),
    timeFrom: parseTime(q.timeFrom) ?? opts.timeFrom,
    timeTo: parseTime(q.timeTo) ?? opts.timeTo,
    rows,
    status: systemStatus(b.systemStatus),
  };
}
