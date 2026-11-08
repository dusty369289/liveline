// The pages with little behaviour: search, Recent, Saved journeys, About, and a page that isn't there.
import { APP_VERSION } from "../../platform";
import type { Html } from "../html";
import { queryOf, type RouteName } from "../routes";
import { aboutView } from "../views/about";
import { homeView, problemView, type Retry } from "../views/home";
import { journeysView } from "../views/journeys";
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

export class JourneysPage extends Page {
  readonly tab: RouteName = "journeys";
  title = "Saved journeys";

  async load(): Promise<Html> {
    return journeysView(this.ctx.journeys.all());
  }

  mount(root: HTMLElement): void {
    for (const b of root.querySelectorAll<HTMLElement>("[data-remove-journey]")) {
      b.addEventListener("click", () => {
        const [from, to] = (b.dataset.removeJourney ?? "").split(" ");
        this.ctx.journeys.remove(from, to);
        this.ctx.rerender();
      });
    }
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

  /** `retry`: when to try again by itself (busy, offline), or null when waiting won't help. */
  constructor(ctx: ConstructorParameters<typeof Page>[0], route: ConstructorParameters<typeof Page>[1],
    private readonly view: Html, private readonly retry: Retry | null) {
    super(ctx, route);
  }

  async load(): Promise<Html> {
    return this.view;
  }

  /** Busy: try again by itself after its wait, or at Realtime Trains' time if it gave a later one (by the rail clock). */
  mount(root: HTMLElement): void {
    root.querySelector("[data-retry]")?.addEventListener("click", () => this.ctx.rerender()); // you asked: not background
    if (this.retry == null) return;
    const wait = Math.max(this.retry.secs * 1000, (this.retry.at ?? 0) - this.ctx.rail.clock());
    const due = Date.now() + wait;
    // Only while it's on screen: a page left open in the background never asks. Coming back after the time it said
    // tries at once. The retry is a background call, so it can't spend the calls kept for searches.
    const tryAgain = () => {
      if (document.visibilityState === "visible" && Date.now() >= due) this.ctx.rerender({ background: true });
    };
    this.after(wait, tryAgain);
    this.whenBack(tryAgain);
  }
}

