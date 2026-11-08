// The search page. Above its heading, on a tall phone: the train you're on, as the train page last counted it, with a
// refresh (one call, at most once a minute) and a way to stop showing it; otherwise the time and the day.
import { RttError } from "../../core/errors";
import { manualMinAge } from "../../core/poll";
import { yourStops } from "../../core/stops";
import { type Html, render } from "../html";
import { parseHash, queryOf, type RouteName } from "../routes";
import { glanceOf } from "../views/live-region";
import { GLANCE_REFRESH_MIN, glanceRefreshDue, homeTop, homeView } from "../views/home";
import { Countdowns } from "../widgets/countdowns";
import { Page } from "./page";

/** How often the clock and your train's countdown are brought up to date while the page is open. */
const TICK = 15_000;

export class HomePage extends Page {
  readonly tab: RouteName = "home";

  async load(): Promise<Html> {
    const c = this.ctx;
    const now = c.rail.clock();
    return homeView({ query: queryOf(this.route.params), carry: c.trains.carryOn(now), journeys: c.journeys.all(), now });
  }

  mount(root: HTMLElement): void {
    const top = root.querySelector<HTMLElement>("[data-home-top]");
    if (!top) return;
    this.wire(top);
    const countdowns = new Countdowns(top);
    this.every(TICK, () => {
      // the time and the day are drawn again whole, so a new day is right too; a train's countdown ticks on
      if (top.querySelector("[data-clock]")) this.draw(top);
      else countdowns.tick(this.ctx.rail.clock());
    });
  }

  /** The block above the heading, alone: the search form under it, half typed or not, is left as it is. */
  private draw(top: HTMLElement): void {
    const now = this.ctx.rail.clock();
    render(top, homeTop(this.ctx.trains.carryOn(now), now));
    this.wire(top);
  }

  /** The block's own buttons: drawn again with it, so wired again with it. */
  private wire(top: HTMLElement): void {
    const { rail, trains } = this.ctx;
    top.querySelector<HTMLElement>("[data-dismiss-train]")?.addEventListener("click", (e) => {
      trains.dismiss((e.currentTarget as HTMLElement).dataset.dismissTrain!);
      // no longer offered anywhere on this page: the Carry on line under the heading goes too
      top.parentElement?.querySelector(".carry:not(.carry--saved)")?.remove();
      this.draw(top);
    });
    const refresh = top.querySelector<HTMLButtonElement>("[data-refresh-train]");
    refresh?.addEventListener("click", async () => {
      const href = refresh.dataset.refreshTrain!;
      const said = top.querySelector<HTMLElement>("[data-glance-said]");
      const now = rail.clock();
      const asOf = trains.carryOn(now)?.glance?.asOf ?? 0;
      // The train page's own rule for a tapped refresh (poll.ts), with a hard floor of a minute on top (owner)
      const b = rail.budget;
      const minAge = manualMinAge(b.state().remaining.hour, b.reserve);
      if (minAge == null) {
        if (said) said.textContent = "Only search calls are left this hour";
        return;
      }
      if (!glanceRefreshDue(asOf, now) || now - asOf < minAge * 1000) {
        const wait = Math.max(GLANCE_REFRESH_MIN, minAge) - Math.floor((now - asOf) / 1000);
        if (said) said.textContent = `Up to date: refresh again in ${wait} s`;
        return;
      }
      const route = parseHash(href);
      const uid = decodeURIComponent(route.path.slice("/train/".length));
      const at = (route.params.get("at") ?? "").toUpperCase();
      const to = (route.params.get("to") ?? "").toUpperCase();
      refresh.classList.add("is-busy");
      refresh.setAttribute("aria-busy", "true");
      try {
        const res = await rail.service(uid, { at, to, force: true }); // asked for: a fresh answer, not the kept one
        const g = glanceOf(...yourStops(res.timeline, at, to), res.fetched.fetchedAt);
        if (g) trains.glance(href, g);
        this.draw(top);
      } catch (e) {
        if (!(e instanceof RttError)) throw e;
        refresh.classList.remove("is-busy");
        refresh.setAttribute("aria-busy", "false");
        if (said) said.textContent = `Not updated: ${e.message}`;
      }
    });
  }
}
