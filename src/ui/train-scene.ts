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
import type { Ms } from "../core/time";
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
  offScreen: 40, // px past the screen's edge a platform is before its sign is swapped on a hop, so it's never seen
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
  private pending: { name: string; number: string | null } | null = null; // on a hop: the sign it's going to
  private readonly reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly panel: HTMLElement;
  private readonly stations: StationIndex;
  private readonly clock: () => Ms;
  private readonly onVisible = () => this.kick();
  private readonly onScroll = () => this.kick();
  private readonly onResize = () => this.layout(false);

  /** `clock` is Rail's: the sky and the dot follow the same time as the answers. */
  constructor(panel: HTMLElement, stations: StationIndex, clock: () => Ms) {
    this.panel = panel;
    this.stations = stations;
    this.clock = clock;
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
    const was = this.sc;
    this.sc = sc;
    const mode = MODE[sc.phase];
    const scene = this.$("[data-scene]");
    scene.dataset.phase = sc.phase;
    scene.dataset.sky = skyFor(sc, this.stations, this.clock());
    this.drawFormation(res.formation);
    // Standing at one station in the last answer and at the next in this one (between polls it left and arrived):
    // show the trip, not a sign that changes under it (2026-11-08)
    const hop = !!this.motion && !this.reduced && mode === "stop" && was != null && MODE[was.phase] === "stop"
      && !!sc.station && !!was.station && sc.station.name !== (this.pending?.name ?? was.station.name) && !this.motion.busy();
    if (!this.motion || this.reduced) this.motion = new Motion(mode); // first sight, or no animation: straight there
    else if (hop && sc.station) this.startHop(sc.station.name, sc.station.platform);
    else this.motion.set(mode);
    if (sc.station && mode === "stop" && !this.pending) this.drawPlatform(sc.station.name, sc.station.platform);
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

  /**
   * Pull away from this platform and brake onto the next one's. Far enough that the old platform goes off the screen
   * behind before the swap, and the next comes in from off the screen ahead, so a sign is never seen to change.
   */
  private startHop(name: string, number: string | null): void {
    const scroller = this.$("[data-scroller]");
    const w = scroller.clientWidth || 360;
    const front = this.padLeft + trainWidth(this.coaches) - scroller.scrollLeft; // the nose, on screen
    const len = trainWidth(this.coaches) + SCENE.platformExtra;
    const leave = Math.max(front + SCENE.platformBeyond + SCENE.offScreen, SCENE.offScreen);
    const enter = Math.max(w + SCENE.offScreen - front - SCENE.platformBeyond + len, SCENE.offScreen);
    this.pending = { name, number };
    this.motion!.hop(leave + enter, leave);
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
    // On a hop, once the old platform is gone behind: the next station's sign, on the platform coming in
    if (this.pending && (m.arriving() || !m.busy())) {
      this.drawPlatform(this.pending.name, this.pending.number);
      this.pending = null;
    }
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
    dot.style.left = `${Math.min(Math.max((this.clock() - a) / (b - a), 0), 1) * 100}%`;
  }
}
