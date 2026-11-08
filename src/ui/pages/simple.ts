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
    return problemView("Not found", "There's no page here.", false);
  }
}

/** Shown instead of a page that couldn't load: what went wrong, in a sentence, and a way on. */
export class ProblemPage extends Page {
  readonly tab: RouteName = "unknown";
  title = "Problem";

  constructor(ctx: ConstructorParameters<typeof Page>[0], route: ConstructorParameters<typeof Page>[1],
    private readonly view: Html, private readonly retry: boolean) {
    super(ctx, route);
  }

  async load(): Promise<Html> {
    return this.view;
  }

  mount(): void {
    if (this.retry) this.after(30_000, () => this.ctx.rerender()); // busy: try again by itself
  }
}

