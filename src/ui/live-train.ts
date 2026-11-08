// The train page while it's open: move the marker every second, and fetch again when the last answer says to.
// It lives inside one long-running app, so stop() undoes every timer and listener when you leave the page
// (TrainPage calls it from dispose()).
import { stopSummary } from "../core/engine";
import { manualMinAge, nextWait } from "../core/poll";
import type { Rail, ServiceResult } from "../core/rail";
import { fragment } from "./html";
import { countText, liveRegion } from "./views/live-region";
import { PassFolds } from "./widgets/pass-folds";

const MIN_AWAY = 26; // px a departed train sits below the point it left, at least
const MIN_AGE = 15_000; // the client won't refetch anything younger either, so pressing refresh again costs nothing

export class LiveTrain {
  private jumped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private busy = false;
  private stopped = false;
  private done = false; // the train arrived or is cancelled: no more background polls
  private message = "";
  private messageUntil = 0;
  private region: HTMLElement;
  private folds: PassFolds;
  private listeners: Array<(res: ServiceResult) => void> = [];
  private onVisible = () => {
    if (document.visibilityState !== "visible" || this.done) return;
    // back in the app: fetch now only if the planned poll is already due, else wait for it
    const due = (this.refreshSecs() ?? Infinity) * 1000;
    const age = Date.now() - this.fetchedAt();
    if (age >= Math.max(due, MIN_AGE * 2)) void this.refresh(false);
    else this.schedule((due - age) / 1000);
  };
  private onResize = () => this.place(true);

  constructor(private page: HTMLElement, private rail: Rail, private uid: string, private at: string, private to: string) {
    this.region = page.querySelector<HTMLElement>("[data-live-region]")!;
    this.folds = new PassFolds(this.region, () => this.place(true));
  }

  /** Called with every new answer this page fetches (the Train view keeps up from these). */
  onAnswer(fn: (res: ServiceResult) => void): void {
    this.listeners.push(fn);
  }

  start(): void {
    this.folds.wire();
    this.page.querySelector("[data-jump]")!.addEventListener("click", () => this.jump(true));
    this.page.querySelector("[data-refresh-now]")!.addEventListener("click", () => this.refreshNow());
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("resize", this.onResize);
    this.place(true);
    // the web font changes row heights, so place it again once the font is in (no animation)
    void document.fonts?.ready.then(() => !this.stopped && this.place(true));
    this.tick = setInterval(() => {
      this.place(false);
      this.age();
      this.countdowns();
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
    this.age();
  }

  private bar() {
    return this.page.querySelector<HTMLElement>("[data-trainbar]");
  }

  /** The icon spins while any fetch runs, automatic or tapped. */
  private setBusy(on: boolean): void {
    this.busy = on;
    const b = this.bar();
    b?.classList.toggle("is-busy", on);
    b?.querySelector("[data-refresh-now]")?.setAttribute("aria-busy", on ? "true" : "false");
    this.age();
  }

  /** A short message in the bar in place of the age, for a few seconds. */
  private say(text: string, secs = 4): void {
    this.message = text;
    this.messageUntil = Date.now() + secs * 1000;
    const note = this.page.querySelector("[data-refresh-note]");
    if (note) note.textContent = text;
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
    if (!l) return 30;
    return l.dataset.refresh ? Number(l.dataset.refresh) || 30 : null;
  }

  private rowCentre(row: Element | null | undefined, wrap: Element): number | null {
    if (!row) return null;
    const r = row.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    return r.top - w.top + r.height / 2;
  }

  // Layout changes (toggling passes, a refreshed list, resizing) jump straight to the new place. Only the train's own
  // progress is animated, or the travelled line would visibly regrow from the top after every refresh.
  place(instant: boolean): void {
    const live = this.live();
    if (!live || !this.region.offsetParent) return; // the Route tab is hidden: nothing has a size to place against
    const wrap = live.querySelector<HTMLElement>(".route-wrap")!;
    if (instant) wrap.classList.add("is-instant");
    const route = live.querySelector<HTMLElement>(".route")!;
    const marker = live.querySelector<HTMLElement>("[data-train-marker]")!;
    marker.dataset.m = document.documentElement.dataset.marker ?? "dot"; // Settings > Appearance
    let done = wrap.querySelector<HTMLElement>(".route__done");
    if (!done) {
      done = document.createElement("div");
      done.className = "route__done";
      wrap.prepend(done);
    }
    const d = live.dataset;
    const rows = [...route.querySelectorAll<HTMLElement>(".route__pt")];
    const from = d.from === "" ? null : rows[Number(d.from)];
    const to = d.to === "" ? null : rows[Number(d.to)];
    let y: number | null = null;
    let waiting = false;
    if (d.state === "running" || d.state === "overdue") {
      const hold = Number(d.hold) || 0.95;
      let rowA = from;
      let rowB = to;
      let since = Number(d.since);
      let expected = Number(d.expected);
      const folded = (r: HTMLElement | null) => !!r && r.classList.contains("is-folded");
      if (folded(from) || folded(to)) {
        // A folded row has no height, so run between the nearest rows you can see, by their times
        const ia = from ? rows.indexOf(from) : -1;
        const ib = to ? rows.indexOf(to) : rows.length;
        for (let i = ia; i >= 0; i--) if (!folded(rows[i])) { rowA = rows[i]; break; }
        for (let i = ib; i < rows.length; i++) if (!folded(rows[i])) { rowB = rows[i]; break; }
        if (rowA && rowA !== from) since = Number(rowA.dataset.tOut) || since;
        if (rowB && rowB !== to) expected = Number(rowB.dataset.tIn) || expected;
      }
      const a = this.rowCentre(rowA, wrap);
      const b = this.rowCentre(rowB, wrap);
      let f = Number(d.fraction) || 0;
      if (since && expected && expected > since) f = Math.min(Math.max((Date.now() - since) / (expected - since), 0), hold);
      if (d.state === "overdue" && rowB === to) f = hold;
      if (d.state === "overdue") waiting = true;
      // Once it has left, keep it clear of both points (not sitting on a ring), even early or late in a long section
      if (a !== null && b !== null) {
        const gap = Math.min(MIN_AWAY, (b - a) / 2);
        y = Math.min(a + Math.max((b - a) * f, gap), b - gap);
      }
    } else if (d.state === "at-station" || d.state === "at-origin") {
      y = this.rowCentre(from ?? to, wrap);
      waiting = true;
    } else if (d.state === "not-started") {
      y = this.rowCentre(to, wrap);
      waiting = true;
    } else if (d.state === "arrived") {
      y = this.rowCentre(from, wrap);
    }
    if (y === null) {
      marker.hidden = true;
      done.style.height = "0";
      wrap.classList.remove("is-instant");
      return;
    }
    marker.hidden = false;
    marker.style.top = `${y}px`;
    marker.classList.toggle("is-waiting", waiting);
    done.style.height = `${Math.max(y, 0)}px`;
    if (instant) {
      void wrap.offsetHeight;
      wrap.classList.remove("is-instant");
    }
    if (!this.jumped) {
      this.jumped = true;
      this.jump(false);
    }
  }

  /**
   * Keep "N min" counting between polls (one may be 3 minutes off), by the same rules the page was drawn with. Only a
   * changed value is written, so the status region announces once a minute, not every second.
   */
  private countdowns(): void {
    const now = Date.now();
    for (const el of this.region.querySelectorAll<HTMLElement>("[data-count-at]")) {
      const big = el.classList.contains("live__hero-num");
      const text = countText(Number(el.dataset.countAt), now, big);
      if (el.textContent === text) continue;
      el.textContent = text;
      if (big && text === "Due") {
        // the hero's own "Due" form: no unit, and the shorter line it kept for this
        el.parentElement?.querySelector(".live__hero-unit")?.remove();
        const what = el.parentElement?.querySelector<HTMLElement>("[data-due-what]");
        if (what) what.textContent = what.dataset.dueWhat ?? "";
        el.removeAttribute("data-count-at");
      }
    }
  }

  jump(smooth: boolean): void {
    const marker = this.region.querySelector<HTMLElement>("[data-train-marker]");
    if (!marker || marker.hidden) return;
    const top = marker.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
    window.scrollTo({ top: Math.max(top, 0), behavior: smooth ? "smooth" : "auto" });
  }

  private age(): void {
    const el = this.page.querySelector("[data-age]");
    if (!el || !this.live()) return;
    if (this.busy) {
      el.textContent = "Updating…";
      return;
    }
    if (this.message && Date.now() < this.messageUntil) {
      el.textContent = this.message;
      return;
    }
    const s = Math.max(0, Math.round((Date.now() - this.fetchedAt()) / 1000));
    const when = s < 5 ? "just now" : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
    el.textContent = `${this.failures ? "Couldn't update. Last answer" : this.done ? "Finished · updated" : "Updated"} ${when}`;
  }

  async refresh(force: boolean): Promise<void> {
    if (this.stopped) return;
    if (!force && document.visibilityState !== "visible") return; // onVisible picks it up when the app comes back
    if (this.busy) return;
    this.setBusy(true);
    try {
      const res = await this.rail.service(this.uid, { background: !force, force, at: this.at, to: this.to });
      if (this.stopped) return;
      const tl = res.timeline;
      const node = fragment(liveRegion(res, this.at, this.to, stopSummary(tl, this.at), stopSummary(tl, this.to, false))).querySelector(".live");
      if (node) this.region.replaceChildren(node);
      this.folds.apply();
      for (const fn of this.listeners) fn(res);
      this.failures = 0;
      this.place(true);
    } catch (e) {
      this.failures += 1;
      this.say(e instanceof Error && e.message ? `Couldn't update: ${e.message}` : "Couldn't update. Trying again soon.", 8);
    } finally {
      this.setBusy(false);
    }
    const secs = this.refreshSecs();
    if (secs == null) return this.finished();
    this.schedule(nextWait(secs, this.failures));
  }

  /** Faster than the automatic polls, but scaled to what's left of the hour (poll.ts, manualMinAge). */
  private refreshNow(): void {
    if (this.busy) return; // already spinning
    const b = this.rail.budget;
    const minAge = manualMinAge(b.state().remaining.hour, b.reserve);
    if (minAge == null) {
      this.say("Only the calls kept for searches are left this hour. Showing the last answer.", 5);
      return;
    }
    const age = Date.now() - this.fetchedAt();
    if (age < minAge * 1000) {
      this.say(age < MIN_AGE ? `Already up to date (${Math.round(age / 1000)} s old)`
        : `Saving calls: you can refresh again in ${Math.ceil(minAge - age / 1000)} s`, 3);
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
