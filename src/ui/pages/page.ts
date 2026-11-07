// What every page is: load its data and markup, wire it once it's on screen, and clean up when you leave.
// Timers go through every()/after() so dispose() always stops them: leaving a page can't leave a poll running.
import type { Rail } from "../../core/rail";
import type { Html } from "../html";
import type { Route, RouteName } from "../routes";
import type { Appearance } from "../store/appearance";
import type { Journeys, RecentStations } from "../store/lists";
import type { RecentTrains } from "../store/recent-trains";
import type { TrainTab } from "../store/train-tab";
import type { Updates } from "../updates";

/** A message to show once on the next page drawn (after saving a key, say). */
export interface Flash { message: string | null; error: string | null }

/** What pages share, owned by App. */
export interface AppContext {
  rail: Rail;
  updates: Updates;
  appearance: Appearance;
  trains: RecentTrains;
  journeys: Journeys;
  stations: RecentStations;
  trainTab: TrainTab;
  flash: Flash;
  /** Draw the current route again (after a change only a fresh page shows). */
  rerender(): void;
}

export abstract class Page {
  /** Which tab is lit in the top bar. */
  abstract readonly tab: RouteName;
  /** The browser/app title; "" for the plain app name. */
  title = "";
  private timers: Array<() => void> = [];

  constructor(protected readonly ctx: AppContext, protected readonly route: Route) {}

  /**
   * Fetch what the page needs and return its markup. `stale()` turns true if you navigate away meanwhile.
   * Return null when the page redirected instead. RttError thrown here becomes a problem page (App).
   */
  abstract load(stale: () => boolean): Promise<Html | null>;

  /** Wire buttons and start timers, once the markup is on screen. */
  mount(_root: HTMLElement): void {}

  dispose(): void {
    for (const stop of this.timers) stop();
    this.timers = [];
  }

  protected every(ms: number, fn: () => void): () => void {
    const id = setInterval(fn, ms);
    const stop = () => clearInterval(id);
    this.timers.push(stop);
    return stop;
  }

  protected after(ms: number, fn: () => void): void {
    const id = setTimeout(fn, ms);
    this.timers.push(() => clearTimeout(id));
  }

  /** Something to stop when the page goes (a LiveTrain, a listener). */
  protected onDispose(stop: () => void): void {
    this.timers.push(stop);
  }
}
