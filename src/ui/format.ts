// Small text formatting shared by the views. Pure: no DOM, no state.
import type { Shown } from "../core/engine";
import type { TrainStatus } from "../core/models";
import { hm, isoDate, type Ms } from "../core/time";

/** RTT's status, in the same words on a board and on the train page. A Record, so a new status is a compile error. */
export const STATUS_WORDS: Record<TrainStatus, string> = {
  APPROACHING: "Approaching",
  ARRIVING: "Arriving",
  AT_PLATFORM: "At platform",
  DEPART_PREPARING: "Getting ready to leave",
  DEPART_READY: "Ready to leave",
  DEPARTING: "Leaving",
};
export const statusNote = (s: TrainStatus | null): string => (s ? ` · ${STATUS_WORDS[s]}` : "");

export function ago(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/** The lateness class a time is coloured by (tokens in the theme). */
export function delayClass(s: Shown | null): string {
  if (!s || s.delayMin == null) return "";
  if (s.delayMin >= 5) return "is-very-late";
  if (s.delayMin >= 2) return "is-late";
  if (s.delayMin <= -1) return "is-early";
  return "is-ontime";
}

/** "7 min late", "On time", "2 min early"; "" for a time that's only booked (nothing to compare). */
export function lateness(s: Shown | null): string {
  if (!s || s.source === "booked" || s.delayMin == null) return "";
  if (s.delayMin === 0) return "On time";
  return s.delayMin > 0 ? `${s.delayMin} min late` : `${-s.delayMin} min early`;
}

/** A time with half minutes shown (½), for working-timetable times. */
export const hmh = (t: Ms | null) => hm(t, true);

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 7 Nov" (UK day). */
export function dayLabel(t: Ms): string {
  const [y, m, d] = isoDate(t).split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** "14:30" today, "Sat 7 Nov, 14:30" another day. */
export function dayOrTime(t: Ms, now: Ms): string {
  return isoDate(t) === isoDate(now) ? hm(t) : `${dayLabel(t)}, ${hm(t)}`;
}

/** "1 passing point", "6 passing points". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
