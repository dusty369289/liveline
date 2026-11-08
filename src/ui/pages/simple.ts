// The pages with little behaviour: search, Recent, About, and a page that isn't there.
import { APP_VERSION } from "../../platform";
import type { Html } from "../html";
import { queryOf, type RouteName } from "../routes";
import { aboutView } from "../views/about";
import { homeView, problemView } from "../views/home";
import { recentView } from "../views/recent";
import { Page } from "./page";

export class HomePage extends Page {
  readonly tab: RouteName = "home";

  async load(): Promise<Html> {
    const c = this.ctx;
    return homeView({ query: queryOf(this.route.params), carry: c.trains.carryOn(c.rail.clock()), journeys: c.journeys.all() });
  }
}

export class RecentPage extends Page {
  readonly tab: RouteName = "recent";
  title = "Recent trains";

  async load(): Promise<Html> {
    return recentView(this.ctx.trains.all(), this.ctx.rail.clock());
  }

  mount(root: HTMLElement): void {
    root.querySelector("[data-clear-recent]")?.addEventListener("click", () => {
      this.ctx.trains.clear();
      this.ctx.rerender();
    });
  }
}

export class AboutPage extends Page {
  readonly tab: RouteName = "about";
  title = "About";

  async load(stale: () => boolean): Promise<Html | null> {
    const rail = this.ctx.rail;
    const info = await rail.tokenInfo();
    if (stale()) return null;
    return aboutView({ demo: rail.demo, info, tokenError: rail.lastTokenError, budget: rail.budget.state(), version: APP_VERSION });
  }
}

export class NotFoundPage extends Page {
  readonly tab: RouteName = "unknown";
  title = "Not found";

  async load(): Promise<Html> {
    return problemView("Not found", "There's no page here.", null);
  }
}

/**
 * A busy or offline page tries again by itself after `first` seconds, doubling after each failure up to `max`: left
 * open while RTT is down, it asks about 12 times an hour rather than 120, and none of them from the reserve.
 */
export const PROBLEM_RETRY = { first: 30, max: 300 };

/** Seconds before trying again, after `failures` failures in a row (0 for the first). */
export const retryDelay = (failures: number): number => Math.min(PROBLEM_RETRY.first * 2 ** failures, PROBLEM_RETRY.max);

/** Shown instead of a page that couldn't load: what went wrong, in a sentence, and a way on. */
export class ProblemPage extends Page {
  readonly tab: RouteName = "unknown";
  title = "Problem";

  /** `retrySecs`: when to try again by itself (busy, offline), or null when waiting won't help. */
  constructor(ctx: ConstructorParameters<typeof Page>[0], route: ConstructorParameters<typeof Page>[1],
    private readonly view: Html, private readonly retrySecs: number | null) {
    super(ctx, route);
  }

  async load(): Promise<Html> {
    return this.view;
  }

  mount(): void {
    if (this.retrySecs == null) return;
    const due = Date.now() + this.retrySecs * 1000;
    // Only while it's on screen: a page left open in the background never asks. Coming back after the time it said
    // tries at once. The retry is a background call, so it can't spend the calls kept for searches.
    const tryAgain = () => {
      if (document.visibilityState === "visible" && Date.now() >= due) this.ctx.rerender({ background: true });
    };
    this.after(this.retrySecs * 1000, tryAgain);
    document.addEventListener("visibilitychange", tryAgain);
    this.onDispose(() => document.removeEventListener("visibilitychange", tryAgain));
  }
}

