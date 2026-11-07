// A row of tabs over panels (WAI-ARIA tabs): click or arrow keys to switch, one panel showing at a time.
// Markup: [role=tablist] holding [role=tab][data-tab=<name>][aria-controls=<panel id>].
export class Tabs {
  private readonly list: HTMLElement;
  private readonly changed: (name: string) => void;

  constructor(list: HTMLElement, changed: (name: string) => void) {
    this.list = list;
    this.changed = changed;
  }

  private tabs(): HTMLElement[] {
    return [...this.list.querySelectorAll<HTMLElement>("[role=tab]")];
  }

  wire(): void {
    this.list.addEventListener("click", (ev) => {
      const tab = (ev.target as Element).closest<HTMLElement>("[role=tab]");
      if (tab) this.select(tab.dataset.tab!);
    });
    this.list.addEventListener("keydown", (ev) => {
      const tabs = this.tabs();
      const at = tabs.findIndex((t) => t === document.activeElement);
      if (at < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
      ev.preventDefault();
      const next = ev.key === "Home" ? 0 : ev.key === "End" ? tabs.length - 1
        : (at + (ev.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      this.select(tabs[next].dataset.tab!, true);
    });
  }

  select(name: string, focus = false): void {
    for (const tab of this.tabs()) {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !on;
      if (on && focus) tab.focus();
    }
    this.changed(name);
  }
}
