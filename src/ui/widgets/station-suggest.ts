// Type-ahead for a station box: the bundled station list, no network. An empty box offers your recent stations as
// soon as it's tapped (the search page doesn't list them separately, so it fits one screen). Arrow keys, Enter and
// Escape work. For screen readers it's the ARIA combobox pattern: the box is a combobox controlling a listbox named
// by the box's label, the highlighted station is its aria-activedescendant, and a status line says how many match.
import type { StationIndex } from "../../core/stations";
import { plural } from "../format";

interface Item { name: string; crs: string }

export class StationSuggest {
  private items: Item[] = [];
  private active = -1;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement | null;
  private readonly stations: StationIndex;
  private readonly recent: () => Item[];

  constructor(box: HTMLElement, stations: StationIndex, recent: () => Item[] = () => []) {
    this.stations = stations;
    this.recent = recent;
    this.input = box.querySelector("input")!;
    this.list = box.querySelector<HTMLElement>(".suggest__list")!;
    this.status = box.querySelector<HTMLElement>("[data-suggest-status]");
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("focus", () => this.search());
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.input.addEventListener("blur", () => setTimeout(() => this.close(), 100));
  }

  /** Every station box under `root`; `recent` gives the stations to offer in an empty box. */
  static wireAll(root: ParentNode, stations: StationIndex, recent?: () => Item[]): void {
    root.querySelectorAll<HTMLElement>("[data-suggest]").forEach((box) => new StationSuggest(box, stations, recent));
  }

  private search(): void {
    const text = this.input.value.trim();
    this.items = text === "" ? this.recent().map((s) => ({ name: s.name, crs: s.crs }))
      : text.length < 2 ? [] : this.stations.search(text).map((s) => ({ name: s.name, crs: s.crs }));
    this.active = -1;
    this.draw();
    // Said once per search, not on every arrow key (the highlighted option is read out by itself)
    if (this.status) {
      const n = this.items.length;
      this.status.textContent = text === "" ? (n ? plural(n, "recent station") : "")
        : text.length < 2 ? "" : n === 1 ? "1 station matches" : n ? `${n} stations match` : "No stations match";
    }
  }

  private key(e: KeyboardEvent): void {
    if (this.list.hidden) return;
    if (e.key === "ArrowDown") this.move(Math.min(this.active + 1, this.items.length - 1));
    else if (e.key === "ArrowUp") this.move(Math.max(this.active - 1, 0));
    else if (e.key === "Enter" && this.active >= 0) this.choose(this.items[this.active]);
    else if (e.key === "Escape") return this.close();
    else return;
    e.preventDefault();
  }

  private move(i: number): void {
    this.active = i;
    this.draw();
  }

  private choose(s: Item): void {
    this.input.value = `${s.name} (${s.crs})`;
    this.close();
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.active = -1;
  }

  private draw(): void {
    this.list.replaceChildren(...this.items.map((s, i) => {
      const li = document.createElement("li");
      li.id = `${this.list.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === this.active));
      const name = document.createElement("span");
      name.textContent = s.name;
      const crs = document.createElement("span");
      crs.className = "suggest__crs";
      crs.textContent = s.crs;
      li.append(name, crs);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus, so blur doesn't close the list first
        this.choose(s);
      });
      return li;
    }));
    this.list.hidden = this.items.length === 0;
    this.input.setAttribute("aria-expanded", String(this.items.length > 0));
    if (this.active >= 0) this.input.setAttribute("aria-activedescendant", `${this.list.id}-${this.active}`);
    else this.input.removeAttribute("aria-activedescendant");
  }
}
