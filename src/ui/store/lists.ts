// The search page's two saved lists: journeys you saved (with a one-tap return) and stations you looked at.
import { KEYS } from "./keys";
import { Pref } from "./pref";

export interface Journey { from: string; fromName: string; to: string; toName: string }
export interface StationRef { name: string; crs: string }

export class Journeys {
  static readonly MAX = 8;
  private readonly pref = new Pref<Journey[]>(KEYS.journeys, []);

  all(): Journey[] {
    const v = this.pref.get();
    return Array.isArray(v) ? v : [];
  }

  has(j: Journey): boolean {
    return this.all().some((x) => x.from === j.from && x.to === j.to);
  }

  /** Save it if it isn't saved, remove it if it is. Returns whether it's saved now. */
  toggle(j: Journey): boolean {
    const saved = this.has(j);
    this.pref.set(saved ? this.all().filter((x) => !(x.from === j.from && x.to === j.to)) : [j, ...this.all()].slice(0, Journeys.MAX));
    return !saved;
  }
}

export class RecentStations {
  static readonly MAX = 6;
  private readonly pref = new Pref<StationRef[]>(KEYS.recentStations, []);

  all(): StationRef[] {
    const v = this.pref.get();
    return Array.isArray(v) ? v : [];
  }

  remember(s: StationRef): void {
    this.pref.set([s, ...this.all().filter((x) => x.crs !== s.crs)].slice(0, RecentStations.MAX));
  }
}
