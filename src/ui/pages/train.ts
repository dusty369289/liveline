// A train page: fetch the train, remember it for Recent, and hand the live part to LiveTrain. Two tabs show the same
// answers: Route (every point, with the marker) and Train view (the train in its scenery, TrainScene).
import { stopSummary } from "../../core/engine";
import type { ServiceResult } from "../../core/rail";
import { sceneOf } from "../../core/scene";
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
  private res: ServiceResult | null = null;

  async load(stale: () => boolean): Promise<Html | null> {
    const res = await this.ctx.rail.service(this.uid, { at: this.at, to: this.to });
    if (stale()) return null;
    this.res = res;
    const tl = res.timeline;
    this.title = trainTitle(res);
    this.ends = tl.service.destinations[0]?.time ?? 0;
    const tab = this.ctx.trainTab.get();
    const sc = sceneOf(tl);
    const scene = scenePanel(sc, res.formation, tl.position.headline, skyFor(sc, this.ctx.rail.stations, Date.now()), tab === "scene");
    return trainView(res, this.uid, this.at, this.to, stopSummary(tl, this.at), stopSummary(tl, this.to, false), { tab, scene });
  }

  mount(root: HTMLElement): void {
    this.ctx.trains.remember({ href: location.hash, title: this.title, ends: this.ends, seen: Date.now() });
    const page = root.querySelector<HTMLElement>("[data-train]")!;
    const live = new LiveTrain(page, this.ctx.rail, this.uid, this.at, this.to);
    const scene = new TrainScene(page.querySelector<HTMLElement>("[data-scene-panel]")!, this.ctx.rail.stations);
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
    this.onDispose(() => {
      live.stop();
      scene.stop();
    });
  }
}
