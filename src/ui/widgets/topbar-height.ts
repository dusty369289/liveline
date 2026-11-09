// The top bar's height, kept on <html> as --topbar-h for the CSS: with the tabs at the top it sticks (block/tabs.css),
// and what sticks under it (the train page's bar) needs to know where it ends. Its height changes with the phone's
// text size (the tabs take a line of their own), so it's measured, not assumed.
export class TopbarHeight {
  private observer: ResizeObserver | null = null;

  /** Measure the top bar in `root` now and whenever it changes size. Called each time the chrome is drawn. */
  watch(root: ParentNode): void {
    this.observer?.disconnect();
    const bar = root.querySelector<HTMLElement>(".topbar");
    if (!bar) return;
    // exactly, fractions and all: offsetHeight rounds to a whole pixel
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${bar.getBoundingClientRect().height}px`);
    set();
    if (typeof ResizeObserver === "undefined") return; // a test DOM without it: the first measure stands
    this.observer = new ResizeObserver(set);
    this.observer.observe(bar);
  }
}
