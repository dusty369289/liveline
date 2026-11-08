// The app shell: which page a route is, drawing it inside the chrome, and what happens when it can't load.
// Pages live in pages/, their markup in views/, shared pieces in components/ and widgets/, stored data in store/.
import { BusyError, OfflineError, type Rail, RttError } from "../core/rail";
import { chrome } from "./components/chrome";
import { SearchForm } from "./components/search-form";
import { type Html, html, render } from "./html";
import { BoardPage } from "./pages/board";
import type { AppContext, Page } from "./pages/page";
import { SettingsPage } from "./pages/settings";
import { AboutPage, HomePage, NotFoundPage, ProblemPage, RecentPage } from "./pages/simple";
import { TrainPage } from "./pages/train";
import { parseHash, queryOf, type Route, type RouteName } from "./routes";
import { Appearance } from "./store/appearance";
import { TrainTab } from "./store/train-tab";
import { Journeys, RecentStations } from "./store/lists";
import { RecentTrains } from "./store/recent-trains";
import { Updates } from "./updates";
import { problemView } from "./views/home";
import { StationSuggest } from "./widgets/station-suggest";

type PageClass = new (ctx: AppContext, route: Route) => Page;

const BROKEN = "LiveLine hit a problem of its own showing this page. Trying again may work; if it keeps happening, it's a bug.";
const MOUNT_FAILED = "Part of this page didn't start properly, so some buttons may not work. Open the page again to retry.";

const PAGES: Record<RouteName, PageClass> = {
  home: HomePage,
  board: BoardPage,
  train: TrainPage,
  recent: RecentPage,
  settings: SettingsPage,
  about: AboutPage,
  unknown: NotFoundPage,
};

export class App {
  private readonly ctx: AppContext;
  private page: Page | null = null;
  private seq = 0; // a newer navigation wins over a slow answer
  private flashRegion: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement, rail: Rail) {
    this.ctx = {
      rail,
      updates: new Updates(() => this.updateChanged()),
      appearance: new Appearance(),
      trains: new RecentTrains(),
      journeys: new Journeys(),
      stations: new RecentStations(),
      trainTab: new TrainTab(),
      flash: { message: null, error: null },
      rerender: () => void this.render(),
    };
  }

  async start(): Promise<void> {
    window.addEventListener("hashchange", () => void this.render()); // before any wait: a tap meanwhile still counts
    this.ctx.appearance.apply();
    this.ctx.updates.restore(); // before the first draw, so a banner found earlier doesn't draw the page twice
    try {
      await this.ctx.rail.start();
    } catch (e) {
      console.error("Couldn't read the saved key, so showing demo trains", e); // Rail starts in demo mode
    }
    await this.render();
    void this.ctx.updates.daily();
  }

  /** Draw the route in the hash. Never throws: whatever goes wrong ends as a page saying so, not "Loading…" for good. */
  async render(): Promise<void> {
    const mine = ++this.seq;
    const stale = () => mine !== this.seq;
    const route = parseHash(location.hash);
    this.navigating(true);
    try {
      const { page, view } = await this.load(route, stale);
      if (stale() || !view) return;
      this.draw(page, view);
    } catch (e) {
      if (stale()) return;
      try {
        const page = this.problem(route, e);
        const view = await page.load(stale);
        if (view && !stale()) this.draw(page, view);
      } catch (again) {
        console.error("Couldn't even show the problem page", again);
      }
    } finally {
      if (!stale()) this.navigating(false); // a newer navigation is still waiting: it clears it
    }
  }

  /** While the next page loads, the old one stays; screen readers hear "busy", and a slow wait shows a thin line (CSS). */
  private navigating(on: boolean): void {
    this.root.classList.toggle("is-navigating", on);
    if (on) this.root.setAttribute("aria-busy", "true");
    else this.root.removeAttribute("aria-busy");
  }

  /** The page's own data and markup, or a problem page when it can't be had. */
  private async load(route: Route, stale: () => boolean): Promise<{ page: Page; view: Html | null }> {
    const page = new PAGES[route.name](this.ctx, route);
    try {
      return { page, view: await page.load(stale) };
    } catch (e) {
      if (stale()) return { page, view: null };
      const problem = this.problem(route, e);
      return { page: problem, view: await problem.load(stale) };
    }
  }

  /** Swap pages: the old one stops only now, so it keeps working while a slow answer for the next is awaited. */
  private draw(page: Page, view: Html): void {
    this.page?.dispose();
    this.page = page;
    render(this.root, chrome({ route: page.tab, demo: this.ctx.rail.demo, budget: this.ctx.rail.budget.state(), banner: this.ctx.updates.banner(page.tab) }, view));
    this.keepFlashRegion();
    document.title = page.title ? `${page.title} · LiveLine` : "LiveLine";
    this.wireShared();
    try {
      page.mount(this.root);
    } catch (e) {
      console.error("A page didn't start properly", e);
      this.ctx.flash.error = MOUNT_FAILED;
    }
    this.showFlash();
  }

  /**
   * A page that couldn't load says why, plainly; "busy" tries again by itself. Anything that isn't Realtime Trains'
   * answer is a fault in the app: the details go to the console, and the page offers to try again.
   */
  private problem(route: Route, e: unknown): Page {
    if (!(e instanceof RttError)) {
      console.error("A page failed to load", e);
      return new ProblemPage(this.ctx, route, problemView("Something went wrong", BROKEN, false, null, true), false);
    }
    const busy = e instanceof BusyError;
    const title = e instanceof OfflineError ? "No connection" : busy ? "Realtime Trains is busy" : "Couldn't show that";
    return new ProblemPage(this.ctx, route, problemView(title, e.message, busy, route.name === "board" ? queryOf(route.params) : null), busy);
  }

  /**
   * The message region is the same element on every page: a screen reader announces a change to a live region it
   * already knows, and may miss one that arrived with a whole new page.
   */
  private keepFlashRegion(): void {
    const fresh = this.root.querySelector<HTMLElement>("[data-flash]");
    if (!fresh) return;
    if (this.flashRegion) fresh.replaceWith(this.flashRegion);
    else this.flashRegion = fresh;
  }

  /** The message waiting for the next page (after saving a key, say), shown once. */
  private showFlash(): void {
    const el = this.flashRegion;
    const { message, error } = this.ctx.flash;
    this.ctx.flash.message = this.ctx.flash.error = null;
    if (!el) return;
    el.classList.toggle("is-problem", !!error);
    el.textContent = error ?? message ?? "";
  }

  /**
   * An update check answered or an install failed. Settings shows it in its own section, so it's drawn again; any
   * other page only swaps its banner, so a half-typed search or an open train page is left alone.
   */
  private updateChanged(): void {
    if (this.page?.tab === "settings") return void this.render();
    const slot = this.root.querySelector<HTMLElement>("[data-banner-slot]");
    if (!slot || !this.page) return;
    render(slot, this.ctx.updates.banner(this.page.tab) ?? html``);
    this.ctx.updates.wire(slot);
  }

  /** What any page may contain: the search form with its station boxes, and the update buttons. */
  private wireShared(): void {
    // The routes live in the hash, so "#main" would be a page that isn't there: move focus instead of following it
    this.root.querySelector(".skip-link")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      this.root.querySelector<HTMLElement>("main")?.focus();
    });
    StationSuggest.wireAll(this.root, this.ctx.rail.stations, () => this.ctx.stations.all());
    SearchForm.wire(this.root);
    this.ctx.updates.wire(this.root);
  }
}
