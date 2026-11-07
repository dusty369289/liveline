// Trains you've opened, newest first, for the Recent tab and the one-line "carry on" link on the search page.
// Kept on this device only (localStorage via prefs). The single "liveline.tracking" entry older versions kept is read
// once to seed the list, and still written, so an update never loses what you were following.
import type { Ms } from "../core/time";
import { prefs } from "./prefs";

export interface RecentTrain {
  href: string; // "#/train/<id>?at=..&to=.."
  title: string; // "19:00 London Paddington to Oxford"
  ends: Ms; // when it's due at its destination (0 if unknown)
  seen: Ms; // last opened
}

const LIST = "liveline.trains";
const LEGACY = "liveline.tracking";
const MAX = 30;
const RUNNING_FOR = 30 * 60_000; // still "running" until half an hour after it's due to finish
const FALLBACK = 3 * 3_600_000; // no end time known: three hours after it was opened

/** The train in a link, ignoring where you get on and off: the same train seen from two stops is one entry. */
const trainOf = (href: string) => href.split("?")[0];

export function recentTrains(): RecentTrain[] {
  let list = prefs.get<RecentTrain[]>(LIST, []);
  if (!Array.isArray(list)) list = [];
  if (!list.length) {
    const old = prefs.get<RecentTrain | null>(LEGACY, null);
    if (old && typeof old.href === "string" && old.href.startsWith("#/train/")) list = [old];
  }
  return list.filter((t) => t && typeof t.href === "string" && t.href.startsWith("#/train/") && typeof t.title === "string");
}

export function rememberTrain(t: RecentTrain): void {
  const list = [t, ...recentTrains().filter((x) => trainOf(x.href) !== trainOf(t.href))].slice(0, MAX);
  prefs.set(LIST, list);
  prefs.set(LEGACY, t);
}

export function forgetTrains(): void {
  prefs.set(LIST, []);
  prefs.set(LEGACY, null);
}

export function isRunning(t: RecentTrain, now: Ms): boolean {
  return now <= (t.ends ? t.ends + RUNNING_FOR : t.seen + FALLBACK);
}

/** The newest train still running, for the search page's one line. */
export function carryOn(now: Ms): RecentTrain | null {
  return recentTrains().find((t) => isRunning(t, now)) ?? null;
}
