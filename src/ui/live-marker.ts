// The train marker and the travelled line on the train page's route: where they stand at this second, against the rows
// as they're laid out now (folds, fonts and resizes all move them). live-train.ts calls place() every second.
import { DEFAULT_ENGINE, sectionFraction } from "../core/engine";
import type { Ms } from "../core/time";
import { clampBetween, MIN_AWAY, PASS_AWAY } from "./route-place";

export class LiveMarker {
  private jumped = false;

  /** `jumpButton` is "Jump to train": hidden while there's no marker to jump to. */
  constructor(private region: HTMLElement, private clock: () => Ms, private jumpButton: HTMLElement | null) {}

  /**
   * Where a stop's ring is, from the top of the route: the ring is CSS (route.css puts it on the name's first line,
   * --line-mid), so it's read from there rather than worked out again. A row with no mark: its middle.
   */
  private rowCentre(row: Element | null | undefined, wrap: Element): number | null {
    if (!row) return null;
    const w = wrap.getBoundingClientRect();
    const mark = row.querySelector(".route__mark");
    const ring = mark ? parseFloat(getComputedStyle(mark, "::after").top) : NaN;
    if (mark && Number.isFinite(ring)) return mark.getBoundingClientRect().top - w.top + ring;
    const r = row.getBoundingClientRect();
    return r.top - w.top + r.height / 2;
  }

  // Layout changes (toggling passes, a refreshed list, resizing) jump straight to the new place. Only the train's own
  // progress is animated, or the travelled line would visibly regrow from the top after every refresh.
  place(instant: boolean): void {
    const live = this.region.querySelector<HTMLElement>(".live");
    if (!live || !this.region.offsetParent) return; // the Route tab is hidden: nothing has a size to place against
    const wrap = live.querySelector<HTMLElement>(".route-wrap")!;
    if (instant) wrap.classList.add("is-instant");
    const route = live.querySelector<HTMLElement>(".route")!;
    const marker = live.querySelector<HTMLElement>("[data-train-marker]")!;
    marker.dataset.m = document.documentElement.dataset.marker ?? "dot"; // Settings > Appearance
    const done = wrap.querySelector<HTMLElement>(".route__done")!; // the travelled line (views/live-region.ts)
    const d = live.dataset;
    const rows = [...route.querySelectorAll<HTMLElement>(".route__pt")];
    const from = d.from === "" ? null : rows[Number(d.from)];
    const to = d.to === "" ? null : rows[Number(d.to)];
    let y: number | null = null;
    if (d.state === "running" || d.state === "overdue") {
      const hold = Number(d.hold) || DEFAULT_ENGINE.holdFraction;
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
      if (since && expected && expected > since) f = sectionFraction(since, expected, this.clock(), hold);
      if (d.state === "overdue" && rowB === to) f = hold;
      // Once it has left, keep it clear of both points (not sitting on a station's ring), even early or late in a long
      // section; a passing point is only a tick, so less, which leaves it room to move between passes
      const away = (r: HTMLElement | null) => (r?.classList.contains("is-pass") ? PASS_AWAY : MIN_AWAY);
      if (a !== null && b !== null) y = clampBetween(a, b, f, away(rowA), away(rowB));
    } else if (d.state === "at-station" || d.state === "at-origin") {
      y = this.rowCentre(from ?? to, wrap);
    } else if (d.state === "not-started") {
      y = this.rowCentre(to, wrap);
    } else if (d.state === "arrived" || d.state === "unreported") {
      y = this.rowCentre(from, wrap);
    }
    // No marker, no "Jump to train": a button that does nothing would look broken
    if (this.jumpButton) this.jumpButton.hidden = y === null;
    if (y === null) {
      marker.hidden = true;
      done.style.height = "0";
      wrap.classList.remove("is-instant");
      return;
    }
    marker.hidden = false;
    marker.style.top = `${y}px`;
    // The travelled ink starts where the line does, at the first stop's centre, not above it
    const start = this.rowCentre(rows.find((r) => !r.classList.contains("is-folded")), wrap) ?? 0;
    done.style.top = `${start}px`;
    done.style.height = `${Math.max(y - start, 0)}px`;
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
}
