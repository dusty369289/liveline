// A train page: fetch the train, remember it for Recent, and hand the live part to LiveTrain.
import { stopSummary } from "../../core/engine";
import type { Html } from "../html";
import { LiveTrain } from "../live-train";
import type { RouteName } from "../routes";
import { trainTitle, trainView } from "../views/train";
import { Page } from "./page";

export class TrainPage extends Page {
  readonly tab: RouteName = "unknown"; // no tab: you got here from a board, Recent or a journey
  private readonly uid = decodeURIComponent(this.route.path.slice("/train/".length));
  private readonly at = (this.route.params.get("at") ?? "").toUpperCase();
  private readonly to = (this.route.params.get("to") ?? "").toUpperCase();
  private ends = 0;

  async load(stale: () => boolean): Promise<Html | null> {
    const res = await this.ctx.rail.service(this.uid, { at: this.at, to: this.to });
    if (stale()) return null;
    const tl = res.timeline;
    this.title = trainTitle(res);
    this.ends = tl.service.destinations[0]?.time ?? 0;
    return trainView(res, this.uid, this.at, this.to, stopSummary(tl, this.at), stopSummary(tl, this.to, false));
  }

  mount(root: HTMLElement): void {
    this.ctx.trains.remember({ href: location.hash, title: this.title, ends: this.ends, seen: Date.now() });
    const live = new LiveTrain(root.querySelector<HTMLElement>("[data-train]")!, this.ctx.rail, this.uid, this.at, this.to);
    live.start();
    this.onDispose(() => live.stop());
  }
}
