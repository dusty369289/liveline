// The train page while it's open: move the marker every second, and fetch again when the last answer says to.
// Port of the Python app's static/js/live.js. Unlike a server-rendered page, this lives inside one long-running app,
// so stop() undoes every timer and listener when you leave the page.
import { stopSummary } from "../core/engine";
import type { Rail } from "../core/rail";
import { liveRegion } from "./views";
import { prefs } from "./prefs";

const MIN_AGE = 15_000; // the client won't refetch anything younger either, so pressing refresh again costs nothing

export class LiveTrain {
  private jumped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private busy = false;
  private stopped = false;
  private region: HTMLElement;
  private passes: HTMLInputElement;
  private onVisible = () => {
    const age = Date.now() - this.fetchedAt();
    if (document.visibilityState === "visible" && age > MIN_AGE * 2) void this.refresh(false);
  };
  private onResize = () => this.place(true);

  constructor(private page: HTMLElement, private rail: Rail, private uid: string, private at: string, private to: string) {
    this.region = page.querySelector<HTMLElement>("[data-live-region]")!;
    this.passes = page.querySelector<HTMLInputElement>("[data-toggle-passes]")!;
  }

  start(): void {
    this.passes.checked = prefs.get("liveline.passes", true);
    this.passes.addEventListener("change", () => {
      prefs.set("liveline.passes", this.passes.checked);
      this.place(true);
    });
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
    }, 1000);
    this.schedule(this.refreshSecs());
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
  private refreshSecs() {
    const l = this.live();
    return l ? Number(l.dataset.refresh) || 30 : 30;
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
    if (!live) return;
    const wrap = live.querySelector<HTMLElement>(".route-wrap")!;
    if (instant) wrap.classList.add("is-instant");
    const route = live.querySelector<HTMLElement>(".route")!;
    const marker = live.querySelector<HTMLElement>("[data-train-marker]")!;
    route.classList.toggle("hide-passes", !this.passes.checked);
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
      if (!this.passes.checked) {
        // Hidden rows have no height, so run between the nearest visible stops, by their times
        const ia = from ? rows.indexOf(from) : -1;
        const ib = to ? rows.indexOf(to) : rows.length;
        for (let i = ia; i >= 0; i--) if (!rows[i].classList.contains("is-pass")) { rowA = rows[i]; break; }
        for (let i = ib; i < rows.length; i++) if (!rows[i].classList.contains("is-pass")) { rowB = rows[i]; break; }
        if (rowA && rowA !== from) since = Number(rowA.dataset.tOut) || since;
        if (rowB && rowB !== to) expected = Number(rowB.dataset.tIn) || expected;
      }
      const a = this.rowCentre(rowA, wrap);
      const b = this.rowCentre(rowB, wrap);
      let f = Number(d.fraction) || 0;
      if (since && expected && expected > since) f = Math.min(Math.max((Date.now() - since) / (expected - since), 0), hold);
      if (d.state === "overdue" && rowB === to) f = hold;
      if (d.state === "overdue") waiting = true;
      if (a !== null && b !== null) y = a + (b - a) * f;
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

  jump(smooth: boolean): void {
    const marker = this.region.querySelector<HTMLElement>("[data-train-marker]");
    if (!marker || marker.hidden) return;
    const top = marker.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
    window.scrollTo({ top: Math.max(top, 0), behavior: smooth ? "smooth" : "auto" });
  }

  private age(): void {
    const el = this.region.querySelector("[data-age]");
    if (!el || !this.live()) return;
    const s = Math.max(0, Math.round((Date.now() - this.fetchedAt()) / 1000));
    el.textContent = s < 60 ? `Updated ${s} s ago` : `Updated ${Math.floor(s / 60)} min ago`;
  }

  async refresh(force: boolean): Promise<void> {
    if (this.stopped) return;
    if (!force && document.visibilityState !== "visible") {
      this.schedule(15);
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      const res = await this.rail.service(this.uid, { background: !force, force });
      if (this.stopped) return;
      const tl = res.timeline;
      const fresh = liveRegion(res, this.at, this.to, stopSummary(tl, this.at), stopSummary(tl, this.to, false));
      const tpl = document.createElement("template");
      tpl.innerHTML = fresh.value;
      const node = tpl.content.querySelector(".live");
      if (node) this.region.replaceChildren(node);
      this.failures = 0;
      this.place(true);
    } catch (e) {
      this.failures += 1;
      const el = this.region.querySelector("[data-age]");
      if (el) el.textContent = e instanceof Error && e.message ? `Couldn't update: ${e.message} Trying again soon.` : "Couldn't update. Trying again soon.";
    } finally {
      this.busy = false;
    }
    this.schedule(Math.min(this.refreshSecs() * (1 + this.failures), 300));
  }

  private refreshNow(): void {
    const age = Date.now() - this.fetchedAt();
    const note = this.page.querySelector("[data-refresh-note]")!;
    if (age < MIN_AGE || this.busy) {
      note.textContent = this.busy ? "Checking…" : `Already up to date (${Math.round(age / 1000)} s old).`;
      return;
    }
    note.textContent = "Checking…";
    void this.refresh(true).then(() => (note.textContent = ""));
  }

  private schedule(secs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(false), secs * 1000);
  }
}
