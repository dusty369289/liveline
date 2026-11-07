// The passing-point folds on the train page: which runs of passing points are open, kept across refreshes.
// A group the train is in opens by itself, so you can see where it is; one you fold stays folded.
import { plural } from "../format";

export class PassFolds {
  private open = new Set<string>(); // groups the user opened
  private closed = new Set<string>(); // groups the user folded, which stay folded even with the train in them
  private region: HTMLElement;
  private changed: () => void;

  /** `region` holds the route (its contents are replaced on refresh); `changed` runs after a tap opens or folds one. */
  constructor(region: HTMLElement, changed: () => void) {
    this.region = region;
    this.changed = changed;
  }

  /** "6 passing points" opens that group; "Fold away" at its top closes it again. */
  wire(): void {
    this.region.addEventListener("click", (ev) => {
      const btn = (ev.target as Element).closest<HTMLElement>("[data-fold-toggle]");
      if (!btn) return;
      const g = btn.dataset.foldToggle!;
      const [from, into] = this.isOpen(g) ? [this.open, this.closed] : [this.closed, this.open];
      from.delete(g);
      into.add(g);
      this.apply();
      this.changed();
    });
    this.apply();
  }

  /** Show the open groups, fold the rest, and say which way each button goes. Call again after each refresh. */
  apply(): void {
    for (const btn of this.region.querySelectorAll<HTMLElement>("[data-fold-toggle]")) {
      const g = btn.dataset.foldToggle!;
      const open = this.isOpen(g);
      const rows = this.region.querySelectorAll<HTMLElement>(`.route__pt[data-group="${g}"]`);
      rows.forEach((r) => r.classList.toggle("is-folded", !open));
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      const label = btn.querySelector("[data-fold-label]");
      if (label) label.textContent = `${open ? "Fold away " : ""}${plural(rows.length, "passing point")}`;
    }
  }

  /** Open if you opened it, or if the train is in it and you haven't folded it. */
  private isOpen(g: string): boolean {
    return this.open.has(g) || (this.trainGroups().has(g) && !this.closed.has(g));
  }

  /** The groups of the points the train is between. */
  private trainGroups(): Set<string> {
    const live = this.region.querySelector<HTMLElement>(".live");
    const out = new Set<string>();
    if (!live) return out;
    for (const i of [live.dataset.from, live.dataset.to]) {
      const g = i ? this.region.querySelector<HTMLElement>(`.route__pt[data-index="${i}"]`)?.dataset.group : undefined;
      if (g) out.add(g);
    }
    return out;
  }
}
