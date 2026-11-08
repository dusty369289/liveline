// The train page's countdowns ("N min", "in N min"): kept counting between polls (one may be 3 minutes off), by the
// same rules the page was drawn with (countText), so the two can't drift. They aren't announced: the page's only live
// region is the Announcer's, which ignores the countdown number. Only a changed value is written.
import { countText } from "../views/live-region";

export class Countdowns {
  private region: ParentNode;

  /** `region` holds the live part of the page (its contents are replaced on every poll). */
  constructor(region: ParentNode) {
    this.region = region;
  }

  /** Redraw every `data-count-at` as it reads at `now`. */
  tick(now: number): void {
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
}
