// The Train view while it's on screen: slides each layer of scenery at its own rate from one distance (core/motion),
// brings platforms in and out, turns the wheels, and keeps the coach names and the two ends of the journey up to
// date with each answer LiveTrain fetches. It runs only while its tab is showing and the app is in front, and sleeps
// whenever nothing moves (standing at a platform), so it costs nothing in the background.
import { type Sky, skyAt } from "../core/daylight";
import type { Formation } from "../core/formation";
import { type Mode, Motion } from "../core/motion";
import type { ServiceResult } from "../core/rail";
import { type Scene, sceneOf } from "../core/scene";
import type { StationIndex } from "../core/stations";
import { fragment, render } from "./html";
import { LAYERS, type Layer, TILE } from "./views/scene-art";
import { COACH, coachLeft, trainSvg, trainWidth } from "./views/train-art";
import { coachList, formationNote, platformSvg, sceneEnds } from "./views/train-scene";

const SCENE = {
  ahead: 32, // px of track kept clear in front of the nose
  shortAt: 0.78, // a train shorter than the screen stands with its nose this far across
  platformBeyond: 20, // px the platform runs past the nose when stopped
  platformExtra: 260, // px of platform beyond the train's length, so its ends are seen
  wheelR: 6, // px, for turning the wheels by the distance travelled
};

/** The sky where the train is now (the station it's at or last passed), or over the middle of GB. */
export function skyFor(sc: Scene, stations: StationIndex, now: number): Sky {
  const near = sc.near ? stations.byCrs(sc.near) : undefined;
  return near?.lat != null && near.lon != null ? skyAt(now, near.lat, near.lon) : skyAt(now);
}

const MODE: Record<Scene["phase"], Mode> = { stopped: "stop", arrived: "stop", cancelled: "stop", unknown: "stop", running: "run", crawling: "crawl" };

export class TrainScene {
  private motion: Motion | null = null;
  private sc: Scene | null = null;
  private formationKey = "";
  private platformKey = "";
  private platformLen = 0;
  private coaches = 0;
  private padLeft = 16;
  private raf = 0;
  private last = 0;
  private showing = false;
  private stopped = false;
  private seenRange = "";
  private placed = false; // scrolled to the front once; after that, where you scrolled stays
  private readonly reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly panel: HTMLElement;
  private readonly stations: StationIndex;
  private readonly onVisible = () => this.kick();
  private readonly onScroll = () => this.kick();
  private readonly onResize = () => this.layout(false);

  constructor(panel: HTMLElement, stations: StationIndex) {
    this.panel = panel;
    this.stations = stations;
  }

  private $<T extends Element = HTMLElement>(sel: string): T {
    return this.panel.querySelector<T>(sel)!;
  }

  start(res: ServiceResult): void {
    this.$("[data-scroller]").addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("resize", this.onResize);
    this.update(res);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.$("[data-scroller]").removeEventListener("scroll", this.onScroll);
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("resize", this.onResize);
  }

  /** Its tab was shown or hidden. Hidden, it does nothing at all. */
  show(on: boolean): void {
    this.showing = on;
    if (on) this.layout(true);
    else cancelAnimationFrame(this.raf);
  }

  /** A new answer: what the train is doing now, how it's made up, and the two ends. */
  update(res: ServiceResult): void {
    const sc = sceneOf(res.timeline);
    this.sc = sc;
    const mode = MODE[sc.phase];
    if (!this.motion || this.reduced) this.motion = new Motion(mode); // first sight, or no animation: straight there
    else this.motion.set(mode);
    const scene = this.$("[data-scene]");
    scene.dataset.phase = sc.phase;
    scene.dataset.sky = skyFor(sc, this.stations, Date.now());
    this.drawFormation(res.formation);
    if (sc.station && mode === "stop") this.drawPlatform(sc.station.name, sc.station.platform);
    render(this.$("[data-ends]"), sceneEnds(sc));
    this.$("[data-headline]").textContent = res.timeline.position.headline;
    render(this.$("[data-formation-note]"), formationNote(res.formation));
    this.layout(false);
  }

  private drawFormation(f: Formation): void {
    const key = JSON.stringify([f.coaches, f.countKnown]);
    if (key === this.formationKey) return;
    const first = this.formationKey === "";
    this.formationKey = key;
    this.coaches = f.coaches.length;
    if (!first) { // a join or a split: draw the new train (the first one came with the page)
      const content = this.$("[data-content]");
      content.querySelector(".scene__train")?.remove();
      content.prepend(fragment(trainSvg(f)));
      render(this.$("[data-coaches]"), coachList(f));
    }
    const bar = this.$("[data-map]");
    bar.replaceChildren(...f.coaches.map(() => document.createElement("i")));
    this.seenRange = "";
  }

  private drawPlatform(name: string, number: string | null): void {
    const key = `${name}|${number ?? ""}`;
    if (key === this.platformKey) return;
    this.platformKey = key;
    this.platformLen = trainWidth(this.coaches) + SCENE.platformExtra;
    render(this.$("[data-platform]"), platformSvg(name, number, this.platformLen));
  }

  /** Sizes the scroll area to the train; on first sight, scrolls to show its front. */
  private layout(toFront: boolean): void {
    const scroller = this.$("[data-scroller]");
    const content = this.$("[data-content]");
    const w = scroller.clientWidth || 360;
    const tw = trainWidth(this.coaches);
    this.padLeft = Math.max(16, Math.round(w * SCENE.shortAt - tw));
    const padRight = Math.max(SCENE.ahead, w - this.padLeft - tw);
    content.style.width = `${this.padLeft + tw + padRight}px`;
    content.style.paddingLeft = `${this.padLeft}px`;
    this.$(".scene__sun").setAttribute("transform", `translate(${w - 64} 56)`);
    if (toFront && !this.placed && w > 0) { // the first time it's seen: the front of the train
      this.placed = true;
      scroller.scrollLeft = scroller.scrollWidth;
    }
    this.kick();
  }

  private kick(): void {
    if (this.stopped || !this.showing || document.visibilityState !== "visible") return;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => {
      this.last = t;
      this.frame(t);
    });
  }

  private frame = (t: number): void => {
    if (this.stopped || !this.showing || !this.motion) return;
    const dt = this.last ? (t - this.last) / 1000 : 0;
    this.last = t;
    const m = this.motion;
    if (!this.reduced) m.step(dt);
    const scroller = this.$("[data-scroller]");
    const camera = m.x + scroller.scrollLeft;
    // CSS transforms on whole layers: composited, so sliding them repaints nothing
    for (const el of this.panel.querySelectorAll<SVGSVGElement>("[data-layer]")) {
      const shift = (camera * LAYERS[el.dataset.layer as Layer]) % TILE;
      el.style.transform = `translate3d(${-shift.toFixed(1)}px,0,0)`;
    }
    const front = this.padLeft + trainWidth(this.coaches) - scroller.scrollLeft; // the nose, on screen
    const ahead = m.platformAhead();
    const platform = this.$("[data-platform]");
    platform.classList.toggle("is-gone", ahead == null || !this.platformKey);
    if (ahead != null) platform.style.transform = `translate3d(${(front + SCENE.platformBeyond + ahead - this.platformLen).toFixed(1)}px,0,0)`;
    // Turning the wheels is the one thing repainted each frame, and only while it moves
    if (m.v > 0) this.panel.querySelector<SVGElement>(".scene__train")?.style.setProperty("--turn",
      `${((m.x / (2 * Math.PI * SCENE.wheelR)) * 360 % 360).toFixed(1)}deg`);
    this.mapSeen(scroller);
    this.dot();
    // Keep going while it moves or is about to; standing at a platform, sleep until a scroll or an answer wakes it
    if (m.busy() && !this.reduced) this.raf = requestAnimationFrame(this.frame);
  };

  /** Which coaches are on screen: the bar under the scene, and "Coaches A–C of 9". */
  private mapSeen(scroller: HTMLElement): void {
    const n = this.coaches;
    const from = scroller.scrollLeft - this.padLeft;
    const to = from + scroller.clientWidth;
    const seen: number[] = [];
    for (let i = 0; i < n; i++) {
      const left = coachLeft(n, i);
      if (left + COACH.w > from + 20 && left < to - 20) seen.push(i);
    }
    const key = seen.join(",");
    if (key === this.seenRange) return;
    this.seenRange = key;
    [...this.$("[data-map]").children].forEach((el, i) => el.classList.toggle("is-seen", seen.includes(n - 1 - i)));
    const names = [...this.panel.querySelectorAll(".coaches__name")].map((el) => (el.textContent ?? "").replace(/^Coach /, ""));
    const a = names[seen[0]] ?? "";
    const b = names[seen[seen.length - 1]] ?? "";
    this.$("[data-map-text]").textContent = !seen.length ? "" : seen.length === n ? `All ${n} coaches`
      : `Coach${seen.length > 1 ? "es" : ""} ${seen.length > 1 ? `${a}–${b}` : a} of ${n}`; // the bar shows there's more
  }

  /** The train's dot on the little line between the two ends, by the clock. */
  private dot(): void {
    const dot = this.panel.querySelector<HTMLElement>("[data-dot]");
    const a = this.sc?.left?.shown?.time;
    const b = this.sc?.right?.shown?.time;
    if (!dot || a == null || b == null || b <= a) return;
    dot.style.left = `${Math.min(Math.max((Date.now() - a) / (b - a), 0), 1) * 100}%`;
  }
}
