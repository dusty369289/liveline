// The app shell: which page a route is, drawing it inside the chrome, and what happens when it can't load.
// Pages live in pages/, their markup in views/, shared pieces in components/ and widgets/, stored data in store/.
import { BusyError, OfflineError, type Rail, RttError } from "../core/rail";
import { chrome } from "./components/chrome";
import { SearchForm } from "./components/search-form";
import { html, render } from "./html";
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
    this.ctx.appearance.apply();
    this.ctx.updates.restore(); // before the first draw, so a banner found earlier doesn't draw the page twice
    await this.ctx.rail.start();
    window.addEventListener("hashchange", () => void this.render());
    await this.render();
    void this.ctx.updates.daily();
  }

  async render(): Promise<void> {
    this.page?.dispose();
    const mine = ++this.seq;
    const stale = () => mine !== this.seq;
    const route = parseHash(location.hash);
    let page: Page = new PAGES[route.name](this.ctx, route);
    let view;
    try {
      view = await page.load(stale);
    } catch (e) {
      if (stale() || !(e instanceof RttError)) throw e;
      page = this.problem(route, e);
      view = await page.load(stale);
    }
    if (stale() || !view) return;
    this.page = page;
    render(this.root, chrome({ route: page.tab, demo: this.ctx.rail.demo, budget: this.ctx.rail.budget.state(), banner: this.ctx.updates.banner(page.tab) }, view));
    document.title = page.title ? `${page.title} · LiveLine` : "LiveLine";
    this.wireShared();
    page.mount(this.root);
  }

  /** A page that couldn't load says why, plainly; "busy" tries again by itself. */
  private problem(route: Route, e: RttError): Page {
    const busy = e instanceof BusyError;
    const title = e instanceof OfflineError ? "No connection" : busy ? "Realtime Trains is busy" : "Couldn't show that";
    return new ProblemPage(this.ctx, route, problemView(title, e.message, busy, route.name === "board" ? queryOf(route.params) : null), busy);
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
