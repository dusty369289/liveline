// How the Train view's train moves, in screen pixels: a picture of what RTT reported, not a simulation of the real
// train. It stands at a platform while stopped, accelerates away once the departure is reported, runs at one easy
// speed between stations, crawls while a report is overdue, and brakes onto the next platform when the arrival is in.
// One distance `x` drives every layer of scenery, so they can never disagree.

export type Mode = "stop" | "run" | "crawl";

export const MOTION = {
  cruise: 240, // px/s between stations: the near scenery passes in under two seconds, calm enough to watch
  crawl: 45, // px/s while a report is overdue: still moving (RTT hasn't said it stopped), visibly unsure
  accel: 60, // px/s² pulling away: about four seconds to speed, like a train rather than a car
  slow: 90, // px/s² easing down to a crawl
  arriveFrom: 520, // px ahead the platform starts when an arrival comes in: off the screen even on a wide phone
  brakeFrom: 160, // px/s at least when braking starts, so stopping from a crawl doesn't take half a minute
  forget: 2400, // px behind the train after which a platform is gone for good
  maxStep: 0.25, // s: one frame never moves further than this, whatever the gap (a background tab)
  hopAccel: 120, // px/s² pulling away and braking on a hop (one answer at a station, the next at the next): a short
  // trip, so twice the usual pull, two seconds to speed, and the whole hop well under ten seconds
};

export class Motion {
  x = 0; // distance travelled, px
  v: number; // px/s
  private mode: Mode;
  private platform: number | null; // the x where the train's front stands at the platform, while one is in play
  private brake: { v0: number; dist: number } | null = null;
  // From one platform to the next while "stop" throughout: the next platform's mark is start + dist, and the old
  // platform (behind) is the one in play until the train has gone swapAt px, when the next one takes over
  private hopping: { start: number; dist: number; swapAt: number } | null = null;

  /** Placed straight into `mode`, with no animation: the page has just opened. */
  constructor(mode: Mode) {
    this.mode = mode;
    this.v = mode === "run" ? MOTION.cruise : mode === "crawl" ? MOTION.crawl : 0;
    this.platform = mode === "stop" ? 0 : null;
  }

  /** The platform's distance ahead of the train's front (negative once passed), or null with none in sight. */
  platformAhead(): number | null {
    if (this.hopping && this.arriving()) return this.hopping.start + this.hopping.dist - this.x;
    return this.platform == null ? null : this.platform - this.x;
  }

  /** Moving, or about to (just told to go): the animation must keep running. False only standing at a platform. */
  busy(): boolean {
    return this.v > 0 || this.mode !== "stop" || this.brake != null || this.hopping != null;
  }

  /**
   * Standing at one platform, the answer says it's standing at the next: go there, `dist` px, pulling away and
   * braking. The platform in play stays the old one until `swapAt` px (when it has gone off the screen behind), then
   * becomes the next one, which then comes in from off the screen ahead (arriving(): the scene redraws its sign).
   */
  hop(dist: number, swapAt: number): void {
    this.mode = "stop";
    this.brake = null;
    this.hopping = { start: this.x, dist, swapAt };
  }

  /** On a hop, past the swap: the platform in play is the next station's. */
  arriving(): boolean {
    return this.hopping != null && this.x - this.hopping.start >= this.hopping.swapAt;
  }

  set(mode: Mode): void {
    if (mode === this.mode) return;
    if (this.hopping) { // cut short by a real departure: carry on from here, with the platform in play
      if (this.arriving()) this.platform = this.hopping.start + this.hopping.dist;
      this.hopping = null;
    }
    this.mode = mode;
    if (mode === "stop") {
      if (this.v === 0) {
        this.platform = this.x; // already standing (a stop after a stop): the platform is here
        return;
      }
      const v0 = Math.max(this.v, MOTION.brakeFrom);
      const dist = Math.max(MOTION.arriveFrom, (v0 * v0) / (2 * MOTION.slow));
      this.platform = this.x + dist;
      this.brake = { v0, dist };
    } else {
      this.brake = null;
    }
  }

  step(dt: number): void {
    dt = Math.min(dt, MOTION.maxStep);
    if (this.hopping) {
      const { start, dist } = this.hopping;
      const gone = this.x - start;
      const left = dist - gone;
      if (left <= 0.5) {
        this.x = start + dist;
        this.v = 0;
        this.platform = this.x;
        this.hopping = null;
        return;
      }
      // Up to speed, along at it, down to the mark: by the distance gone and the distance left (v² = 2as each way),
      // never under 8 px/s at either end, or the first and the last pixel would take forever
      const a = MOTION.hopAccel;
      this.v = Math.max(Math.min(MOTION.cruise, Math.sqrt(2 * a * (gone + 1)), Math.sqrt(2 * a * left)), 8);
      this.x = Math.min(this.x + this.v * dt, start + dist);
      return;
    }
    if (this.mode === "stop") {
      if (this.platform == null || !this.brake) {
        this.v = 0;
        return;
      }
      const left = this.platform - this.x;
      if (left <= 0.5) {
        this.x = this.platform;
        this.v = 0;
        this.brake = null;
        return;
      }
      // Braking to land exactly on the mark: speed falls with the square root of the distance left
      // (never under 8 px/s, or the last pixel would take forever)
      this.v = Math.max(this.brake.v0 * Math.sqrt(left / this.brake.dist), 8);
      this.x = Math.min(this.x + this.v * dt, this.platform);
      return;
    }
    const target = this.mode === "run" ? MOTION.cruise : MOTION.crawl;
    if (this.v < target) this.v = Math.min(target, this.v + MOTION.accel * dt);
    else if (this.v > target) this.v = Math.max(target, this.v - MOTION.slow * dt);
    this.x += this.v * dt;
    if (this.platform != null && this.x - this.platform > MOTION.forget) this.platform = null;
  }
}
