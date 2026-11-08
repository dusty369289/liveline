// A train page: fetch the train, remember it for Recent, and hand the live part to LiveTrain. Two tabs show the same
// answers: Route (every point, with the marker) and Train view (the train in its scenery, TrainScene).
import type { ServiceResult } from "../../core/rail";
import { sceneOf } from "../../core/scene";
import { yourStops } from "../../core/stops";
import type { Html } from "../html";
import { LiveTrain } from "../live-train";
import type { RouteName } from "../routes";
import { skyFor, TrainScene } from "../train-scene";
import { scenePanel } from "../views/train-scene";
import { trainTitle, trainView } from "../views/train";
import { Tabs } from "../widgets/tabs";
import { Page } from "./page";

export class TrainPage extends Page {
  readonly tab: RouteName = "unknown"; // no tab: you got here from a board, Recent or a journey
  private readonly uid = decodeURIComponent(this.route.path.slice("/train/".length));
  private readonly at = (this.route.params.get("at") ?? "").toUpperCase();
  private readonly to = (this.route.params.get("to") ?? "").toUpperCase();
  private ends = 0;
  private starts = 0;
  private res: ServiceResult | null = null;

  async load(stale: () => boolean): Promise<Html | null> {
    const res = await this.ctx.rail.service(this.uid, { at: this.at, to: this.to, background: this.automatic });
    if (stale()) return null;
    this.res = res;
    const tl = res.timeline;
    this.title = trainTitle(res);
    this.ends = tl.service.destinations[0]?.time ?? 0;
    this.starts = tl.service.origins[0]?.time ?? 0;
    const tab = this.ctx.trainTab.get();
    const sc = sceneOf(tl);
    const now = this.ctx.rail.clock();
    const scene = scenePanel(sc, res.formation, tl.position.headline, skyFor(sc, this.ctx.rail.stations, now), tab === "scene");
    return trainView(res, this.uid, this.at, this.to, ...yourStops(tl, this.at, this.to), { tab, scene, now });
  }

  mount(root: HTMLElement): void {
    const rail = this.ctx.rail;
    this.ctx.trains.remember({ href: location.hash, title: this.title, ends: this.ends, starts: this.starts, seen: rail.clock() });
    const page = root.querySelector<HTMLElement>("[data-train]")!;
    const live = new LiveTrain(page, rail, this.uid, this.at, this.to);
    const scene = new TrainScene(page.querySelector<HTMLElement>("[data-scene-panel]")!, rail.stations, rail.clock);
    // before anything starts: if wiring fails half way, leaving the page still stops whatever did start
    this.onDispose(() => {
      live.stop();
      scene.stop();
    });
    live.onAnswer((res) => scene.update(res));
    const tabs = new Tabs(page.querySelector<HTMLElement>("[data-train-tabs]")!, (name) => {
      this.ctx.trainTab.set(name);
      page.dataset.tab = name;
      scene.show(name === "scene");
      if (name === "route") live.place(true); // the route was hidden: its rows had no size until now
    });
    live.start();
    scene.start(this.res!);
    tabs.wire();
    tabs.select(this.ctx.trainTab.get());
  }
}
