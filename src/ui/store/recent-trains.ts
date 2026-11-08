// Trains you've opened, newest first, for the Recent tab and the one-line "carry on" link on the search page.
// The single entry older versions kept (KEYS.tracking) is read once to seed the list, and still written, so an
// update never loses what you were following.
import type { Ms } from "../../core/time";
import { KEYS } from "./keys";
import { Pref } from "./pref";

export interface RecentTrain {
  href: string; // "#/train/<id>?at=..&to=.."
  title: string; // "19:00 London Paddington to Oxford"
  ends: Ms; // when it's due at its destination (0 if unknown)
  seen: Ms; // last opened
  starts?: Ms; // when it's due away from its origin; entries saved by older versions lack it and count as started
}

export class RecentTrains {
  static readonly MAX = 30;
  static readonly RUNNING_FOR = 30 * 60_000; // "running" until half an hour after it's due in
  static readonly FALLBACK = 3 * 3_600_000; // no end time known: three hours after it was opened
  static readonly STARTS_WITHIN = 30 * 60_000; // and from half an hour before it sets off, when you'd be heading for it

  private readonly list = new Pref<RecentTrain[]>(KEYS.trains, []);
  private readonly legacy = new Pref<RecentTrain | null>(KEYS.tracking, null);

  /** The train in a link, ignoring where you get on and off: the same train from two stops is one entry. */
  private static trainOf(href: string): string {
    return href.split("?")[0];
  }

  private static valid(t: unknown): t is RecentTrain {
    const r = t as RecentTrain;
    return !!r && typeof r.href === "string" && r.href.startsWith("#/train/") && typeof r.title === "string";
  }

  static isRunning(t: RecentTrain, now: Ms): boolean {
    if (t.starts && t.starts - RecentTrains.STARTS_WITHIN > now) return false;
    return now <=(t.ends ? t.ends + RecentTrains.RUNNING_FOR : t.seen + RecentTrains.FALLBACK);
  }

  all(): RecentTrain[] {
    const saved = this.list.get();
    const list = Array.isArray(saved) && saved.length ? saved : [this.legacy.get()];
    return list.filter(RecentTrains.valid);
  }

  remember(t: RecentTrain): void {
    const key = RecentTrains.trainOf(t.href);
    this.list.set([t, ...this.all().filter((x) => RecentTrains.trainOf(x.href) !== key)].slice(0, RecentTrains.MAX));
    this.legacy.set(t);
  }

  clear(): void {
    this.list.set([]);
    this.legacy.set(null);
  }

  /** The newest train still running, for the search page's one line. */
  carryOn(now: Ms): RecentTrain | null {
    return this.all().find((t) => RecentTrains.isRunning(t, now)) ?? null;
  }
}
