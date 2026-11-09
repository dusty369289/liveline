// The train marker and the travelled line on the train page's route: where they stand at this second, against the rows
// as they're laid out now (folds, fonts and resizes all move them). live-train.ts calls place() every second.
import { DEFAULT_ENGINE } from "../core/engine";
import type { Ms } from "../core/time";
import { clampBetween, estimateAlong, keepAhead, MIN_AWAY, PASS_AWAY, type RowTimes } from "./route-place";

export class LiveMarker {
  private jumped = false;
  private reached = -1; // how far along the route the marker has got (rows, a + f): it never goes back (keepAhead)

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
      const now = this.clock();
      const iFrom = Number(d.from);
      const times: RowTimes[] = rows.map((r) => ({
        tin: Number(r.dataset.tIn) || null, tout: Number(r.dataset.tOut) || null, call: r.classList.contains("is-call"),
      }));
      // On by the shown times through passing points that haven't reported, never past the next stop (route-place.ts);
      // an overdue point holds it short of that point, as before
      const overdue = d.state === "overdue";
      const est = overdue ? { a: iFrom, b: Number(d.to), f: hold } : estimateAlong(times, iFrom, now, hold);
      // Never back when an answer puts the train behind the marker: it waits there (unless a point is overdue)
      const at = keepAhead(this.reached, est.a + est.f, overdue);
      this.reached = at;
      const ia = Math.min(Math.floor(at), rows.length - 1);
      const f = at - ia;
      const ib = Math.min(ia + 1, rows.length - 1);
      marker.classList.toggle("is-estimated", ia > iFrom); // past the last report: drawn as our guess
      // A folded row has no height: run between the nearest rows you can see, the time at the marker set against theirs
      const folded = (r: HTMLElement | undefined) => !r || r.classList.contains("is-folded");
      let va = ia;
      let vb = ib;
      while (va > 0 && folded(rows[va])) va--;
      while (vb < rows.length - 1 && folded(rows[vb])) vb++;
      const startOf = (i: number) => times[i].tout ?? times[i].tin;
      const endOf = (i: number) => times[i].tin ?? times[i].tout;
      let fv = f;
      if (va !== ia || vb !== ib) {
        const s = startOf(ia);
        const e = endOf(ib);
        const tv0 = startOf(va);
        const tv1 = endOf(vb);
        if (s != null && e != null && tv0 != null && tv1 != null && tv1 > tv0) fv = (s + f * (e - s) - tv0) / (tv1 - tv0);
      }
      const a = this.rowCentre(rows[va], wrap);
      const b = this.rowCentre(rows[vb], wrap);
      // Once it has left, keep it clear of both points (not sitting on a station's ring), even early or late in a long
      // section; a passing point is only a tick, so less, which leaves it room to move between passes
      const away = (r: HTMLElement | undefined) => (r?.classList.contains("is-pass") ? PASS_AWAY : MIN_AWAY);
      if (a !== null && b !== null) y = clampBetween(a, b, Math.min(Math.max(fv, 0), 1), away(rows[va]), away(rows[vb]));
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
