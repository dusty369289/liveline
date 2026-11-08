// The train page while it's open: move the marker every second, and fetch again when the last answer says to.
// It lives inside one long-running app, so stop() undoes every timer and listener when you leave the page
// (TrainPage calls it from dispose()).
import { GIVEN_UP } from "../core/engine";
import { manualMinAge, nextWait } from "../core/poll";
import type { Rail, ServiceResult } from "../core/rail";
import { yourStops } from "../core/stops";
import { keepFocus } from "./focus";
import { fragment } from "./html";
import { LiveMarker } from "./live-marker";
import { liveRegion } from "./views/live-region";
import { Announcer } from "./widgets/announcer";
import { Countdowns } from "./widgets/countdowns";
import { PassFolds } from "./widgets/pass-folds";

const MIN_AGE = 15_000; // the client won't refetch anything younger either, so pressing refresh again costs nothing
// Seconds to the next poll when the page has no answer to plan from (or one with an unreadable plan): soon, but the
// client's cache and the allowance's floor still apply
const FALLBACK_POLL = 30;

export class LiveTrain {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private busy = false;
  private stopped = false;
  private done = false; // nothing more will come (poll.ts FINISHED): no more background polls
  private doneState = ""; // the train's state when it finished: arrived and cancelled are over, given up isn't known
  private message = "";
  private messageUntil = 0;
  private region: HTMLElement;
  private folds: PassFolds;
  private announcer: Announcer;
  private countdowns: Countdowns;
  private marker: LiveMarker;
  private listeners: Array<(res: ServiceResult) => void> = [];
  private onVisible = () => {
    if (document.visibilityState !== "visible" || this.done) return;
    // back in the app: fetch now only if the planned poll is already due, else wait for it
    const due = (this.refreshSecs() ?? Infinity) * 1000;
    const age = this.rail.clock() - this.fetchedAt();
    if (age >= Math.max(due, MIN_AGE * 2)) void this.refresh(false);
    else this.schedule((due - age) / 1000);
  };
  private onResize = () => this.place(true);

  constructor(private page: HTMLElement, private rail: Rail, private uid: string, private at: string, private to: string) {
    this.region = page.querySelector<HTMLElement>("[data-live-region]")!;
    this.folds = new PassFolds(this.region, () => this.place(true));
    this.announcer = new Announcer(page.querySelector<HTMLElement>("[data-refresh-note]")!, this.region);
    this.countdowns = new Countdowns(this.region);
    this.marker = new LiveMarker(this.region, rail.clock, page.querySelector<HTMLElement>("[data-jump]"));
  }

  /** Called with every new answer this page fetches (the Train view keeps up from these). */
  onAnswer(fn: (res: ServiceResult) => void): void {
    this.listeners.push(fn);
  }

  start(): void {
    this.folds.wire();
    this.page.querySelector("[data-jump]")!.addEventListener("click", () => this.marker.jump(true));
    this.page.querySelector("[data-refresh-now]")!.addEventListener("click", () => this.refreshNow());
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("resize", this.onResize);
    this.place(true);
    // the web font changes row heights, so place it again once the font is in (no animation)
    void document.fonts?.ready.then(() => !this.stopped && this.place(true));
    this.tick = setInterval(() => {
      this.place(false);
      this.age();
      this.countdowns.tick(this.rail.clock());
    }, 1000);
    const secs = this.refreshSecs();
    if (secs == null) this.finished();
    else this.schedule(secs);
  }

  /** Nothing more can change for this train: stop polling, and say so in the bar rather than look frozen. */
  private finished(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.done = true;
    this.doneState = this.live()?.dataset.state ?? "";
    this.age();
  }

  /** The icon spins while any fetch runs, automatic or tapped. */
  private setBusy(on: boolean): void {
    this.busy = on;
    const b = this.page.querySelector<HTMLElement>("[data-trainbar]");
    b?.classList.toggle("is-busy", on);
    b?.querySelector("[data-refresh-now]")?.setAttribute("aria-busy", on ? "true" : "false");
    this.age();
  }

  /**
   * A short message in the bar in place of the age, for a few seconds (it wraps to two lines, so keep it short).
   * `detail` is the fuller sentence screen readers hear from the status region instead.
   */
  private say(text: string, secs = 4, detail = text): void {
    this.message = text;
    this.messageUntil = Date.now() + secs * 1000;
    this.announcer.say(detail);
    this.age();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.tick) clearInterval(this.tick);
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("resize", this.onResize);
  }

  private live() {
    return this.region.querySelector<HTMLElement>(".live");
  }
  private fetchedAt() {
    const l = this.live();
    return l ? Number(l.dataset.fetched) : 0;
  }
  /** From the last answer (poll.ts). Null: the train arrived, is cancelled, or you've left it, so stop asking. */
  private refreshSecs(): number | null {
    const l = this.live();
    if (!l) return FALLBACK_POLL;
    return l.dataset.refresh ? Number(l.dataset.refresh) || FALLBACK_POLL : null;
  }

  /** Put the marker where the train is now (live-marker.ts); `instant` for a layout change, not progress. */
  place(instant: boolean): void {
    this.marker.place(instant);
  }

  private age(): void {
    const el = this.page.querySelector("[data-age]");
    if (!el || !this.live()) return;
    const message = !this.busy && !!this.message && Date.now() < this.messageUntil;
    el.classList.toggle("is-message", message);
    if (this.busy) {
      el.textContent = "Updating…";
      return;
    }
    if (message) {
      el.textContent = this.message;
      return;
    }
    const s = Math.max(0, Math.round((this.rail.clock() - this.fetchedAt()) / 1000));
    const when = s < 5 ? "just now" : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
    // Given up on, it may not have finished at all: say only that no reports are coming
    const done = (GIVEN_UP as readonly string[]).includes(this.doneState) ? "No reports · updated" : "Finished · updated";
    el.textContent = `${this.failures ? "Couldn't update. Last answer" : this.done ? done : "Updated"} ${when}`;
  }

  async refresh(force: boolean): Promise<void> {
    if (this.stopped) return;
    if (!force && document.visibilityState !== "visible") return; // onVisible picks it up when the app comes back
    if (this.busy) return;
    this.setBusy(true);
    try {
      const res = await this.rail.service(this.uid, { background: !force, force, at: this.at, to: this.to });
      if (this.stopped) return;
      const node = fragment(liveRegion(res, ...yourStops(res.timeline, this.at, this.to))).querySelector(".live");
      keepFocus(this.region, () => { // a fold button you're on stays focused through a poll
        if (node) this.region.replaceChildren(node);
        this.folds.apply();
      });
      this.announcer.heard(this.region, force);
      for (const fn of this.listeners) fn(res);
      this.failures = 0;
      this.place(true);
    } catch (e) {
      this.failures += 1;
      this.say("Couldn't update. Trying again soon.", 8,
        e instanceof Error && e.message ? `Couldn't update: ${e.message}` : "Couldn't update. Trying again soon.");
    } finally {
      this.setBusy(false);
    }
    const secs = this.refreshSecs();
    if (secs == null) return this.finished();
    this.done = false; // a tap after a give-up brought a live answer: follow it again, coming back to the app too
    this.schedule(nextWait(secs, this.failures));
  }

  /** Faster than the automatic polls, but scaled to what's left of the hour (poll.ts, manualMinAge). */
  private refreshNow(): void {
    if (this.busy) return; // already spinning
    const b = this.rail.budget;
    const minAge = manualMinAge(b.state().remaining.hour, b.reserve);
    if (minAge == null) {
      this.say("Only search calls are left this hour", 5,
        "Only the calls kept for searches are left this hour. Showing the last answer.");
      return;
    }
    const age = this.rail.clock() - this.fetchedAt();
    if (age < minAge * 1000) {
      this.say(age < MIN_AGE ? `Already up to date (${Math.round(age / 1000)} s old)`
        : `Saving calls: refresh in ${Math.ceil(minAge - age / 1000)} s`, 3);
      return;
    }
    void this.refresh(true);
  }

  private schedule(secs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(false), secs * 1000);
  }
}
