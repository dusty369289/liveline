// What the app shows, built by parse.ts from RTT JSON. Plain data, no I/O. Instants are epoch ms (see time.ts).
import type { Ms } from "./time";

export type Kind = "call" | "pass";
export type Display = "CALL" | "PASS" | "CANCELLED" | "DIVERTED" | "STARTS" | "TERMINATES";
export const DISPLAYS: Display[] = ["CALL", "PASS", "CANCELLED", "DIVERTED", "STARTS", "TERMINATES"];

export type TimeSource = "actual" | "forecast" | "rtt-estimate" | "est" | "booked";

/** One event (arrival, departure or pass) at a point. */
export interface Times {
  advertised: Ms | null; // public timetable (GBTT)
  internal: Ms | null; // working timetable (WTT), may have half minutes
  forecast: Ms | null;
  estimate: Ms | null; // RTT's no-report estimate
  actual: Ms | null;
  noReport: boolean;
  cancelled: boolean;
}

export const emptyTimes = (): Times => ({
  advertised: null,
  internal: null,
  forecast: null,
  estimate: null,
  actual: null,
  noReport: false,
  cancelled: false,
});

/** The time to show as booked: public if there is one, else working. */
export const booked = (t: Times): Ms | null => t.advertised ?? t.internal;
/** The time to plan with: the working timetable is finer, so prefer it. */
export const planned = (t: Times): Ms | null => t.internal ?? t.advertised;
export const isEmpty = (t: Times): boolean =>
  t.advertised == null && t.internal == null && t.actual == null && t.forecast == null;

export interface Allowances {
  engineering: number; // seconds
  pathing: number;
  performance: number;
}
export const allowanceTotal = (a: Allowances) => a.engineering + a.pathing + a.performance;

export interface Reason {
  kind: string; // DELAY or CANCEL
  text: string;
}

export interface Point {
  name: string;
  crs: string | null;
  tiploc: string | null;
  kind: Kind;
  display: Display;
  arrival: Times;
  departure: Times;
  passing: Times;
  platform: string | null;
  platformConfirmed: boolean;
  platformChanged: boolean;
  status: string | null;
  public: boolean;
  requestStop: boolean;
  interpolated: boolean;
  allowances: Allowances;
  line: string | null;
  path: string | null;
}

export const isCancelled = (p: Point) => p.display === "CANCELLED" || p.display === "DIVERTED";
export const firstEvent = (p: Point): Times =>
  p.kind === "pass" ? p.passing : isEmpty(p.arrival) ? p.departure : p.arrival;
export const lastEvent = (p: Point): Times =>
  p.kind === "pass" ? p.passing : isEmpty(p.departure) ? p.arrival : p.departure;

export interface Endpoint {
  name: string;
  tiploc: string | null;
  time: Ms | null;
}

export interface Service {
  uniqueId: string; // "C05986:2026-09-06"
  identity: string;
  runDate: string; // YYYY-MM-DD
  headcode: string | null;
  operatorCode: string;
  operatorName: string;
  mode: string;
  passenger: boolean;
  origins: Endpoint[];
  destinations: Endpoint[];
  points: Point[];
  reasons: Reason[];
  vehicles: number | null;
  units: string[];
  leadingClass: string | null;
  branding: string | null;
  stp: string | null;
}

export const originName = (s: Service) => s.origins.map((o) => o.name).join(" & ") || "Unknown";
export const destinationName = (s: Service) => s.destinations.map((o) => o.name).join(" & ") || "Unknown";

export interface BoardRow {
  uniqueId: string;
  identity: string;
  runDate: string;
  headcode: string | null;
  operatorCode: string;
  operatorName: string;
  mode: string;
  origin: string;
  destination: string;
  arrival: Times;
  departure: Times;
  platform: string | null;
  platformConfirmed: boolean;
  platformChanged: boolean;
  display: Display;
  status: string | null;
  vehicles: number | null;
  passenger: boolean;
  callType: string | null;
  branding: string | null;
  line: string | null;
  stp: string | null;
  reasons: Reason[];
}

export const rowCancelled = (r: BoardRow) =>
  r.display === "CANCELLED" ||
  r.display === "DIVERTED" ||
  (isEmpty(r.departure) ? r.arrival.cancelled : r.departure.cancelled);
/** Something a passenger can board or leave here: not empty stock, not a staff-only stop. */
export const forPassengers = (r: BoardRow) => r.passenger && r.callType !== "OPERATIONAL_ONLY";
export const isBus = (r: BoardRow) => r.mode.includes("BUS");

export interface SystemStatus {
  networkRail: string;
  core: string;
}

export function statusMessage(s: SystemStatus): string | null {
  if (s.core === "SCHEDULE_ONLY" || s.networkRail === "REALTIME_DATA_NONE") {
    return "Realtime Trains has no live data right now, so times are the timetable only.";
  }
  if (s.networkRail !== "OK" || s.core !== "OK") {
    return "Realtime Trains says live data is limited right now. Some times may be missing or late.";
  }
  return null;
}

export interface Board {
  stationName: string;
  stationCrs: string | null;
  timeFrom: Ms;
  timeTo: Ms;
  rows: BoardRow[];
  status: SystemStatus;
}
