// A board page: fetch the board, remember the station, save the journey, and keep a "now" board fresh (gently).
import type { BoardResult } from "../../core/rail";
import { fragment, type Html } from "../html";
import { type Query, queryOf, qs, type RouteName, timeParams, when } from "../routes";
import { type BoardNav, boardView } from "../views/board";
import { problemView } from "../views/home";
import { Page } from "./page";

/**
 * A "now" board updates itself every 2 minutes while on screen, as a background call (it never spends the calls kept
 * for searches), for its first 15 minutes; then it waits for Refresh. Left open on a table it would otherwise cost
 * 30 calls an hour.
 */
export const BOARD_REFRESH = { every: 120_000, for: 15 * 60_000 };

export class BoardPage extends Page {
  readonly tab: RouteName = "unknown"; // no tab lit, as before: a board is a result, not a tab
  private query: Query = queryOf(this.route.params);
  private nav: BoardNav | null = null;
  private live = false;

  async load(stale: () => boolean): Promise<Html | null> {
    const q = this.query;
    if (!q.station?.trim()) {
      location.hash = "#/";
      return null;
    }
    let at: number | null;
    try {
      at = when(q.time ?? "", q.day ?? "", this.ctx.rail.clock());
    } catch {
      this.title = "Find trains";
      return problemView("Find trains", "That time isn't valid. Use 24-hour time like 17:45.", false, q);
    }
    const force = this.route.params.get("refresh") === "1";
    const res = await this.request({ when: at, force });
    if (stale()) return null;
    this.title = res.board.stationName;
    this.nav = this.links(res);
    this.live = !q.time;
    if (force) history.replaceState(null, "", this.nav.refresh.replace(/&refresh=1|refresh=1&?/, "")); // don't refetch on back
    return boardView(res, this.nav, this.live, this.ctx.rail.clock());
  }

  mount(root: HTMLElement): void {
    const board = root.querySelector<HTMLElement>("[data-board]");
    if (!board) return; // the "time isn't valid" page
    const d = board.dataset;
    if (d.crs) this.ctx.stations.remember({ name: d.station!, crs: d.crs });
    this.wireSaveJourney(root, d);
    if (this.live) this.keepFresh(root);
  }

  private request(o: { when?: number | null; force?: boolean; background?: boolean }): Promise<BoardResult> {
    const q = this.query;
    return this.ctx.rail.board({ station: q.station!, to: q.to || null, mode: q.mode === "arr" ? "arr" : "dep", showAll: !!q.all, ...o });
  }

  private links(res: BoardResult): BoardNav {
    const q = this.query;
    const base = { station: q.station, to: q.to, mode: q.mode, all: q.all };
    const t0 = res.board.timeFrom;
    const same = { time: q.time, day: q.day };
    return {
      earlier: `#/board${qs({ ...base, ...timeParams(t0 - 3_600_000) })}`,
      later: `#/board${qs({ ...base, ...timeParams(t0 + 3_600_000) })}`,
      refresh: `#/board${qs({ ...base, ...same, refresh: 1 })}`,
      switch: `#/board${qs({ ...base, ...same, mode: q.mode === "arr" ? "dep" : "arr" })}`,
      all: `#/board${qs({ ...base, ...same, all: q.all ? "" : 1 })}`,
      change: `#/${qs({ station: q.station, to: q.to, mode: q.mode === "arr" ? "arr" : "", ...same })}`, // the form, filled in
    };
  }

  private wireSaveJourney(root: HTMLElement, d: DOMStringMap): void {
    const save = root.querySelector<HTMLButtonElement>("[data-save-journey]");
    if (!save) return;
    const j = { from: d.crs!, fromName: d.station!, to: d.toCrs!, toName: d.toName! };
    const note = root.querySelector("[data-save-note]")!;
    // A star on the nameboard: filled once saved. Its name says what a tap does; the note says what happened.
    const show = (saved: boolean) => {
      save.setAttribute("aria-pressed", saved ? "true" : "false");
      save.setAttribute("aria-label", saved ? "Saved journey: tap to remove" : "Save this journey");
      save.title = saved ? "Remove this journey" : "Save this journey";
    };
    show(this.ctx.journeys.has(j));
    save.addEventListener("click", () => {
      const saved = this.ctx.journeys.toggle(j);
      show(saved);
      note.textContent = saved ? "Saved: it's on the search page now." : "Removed from your journeys.";
    });
  }

  /** Swap in the fresh rows and footer, without jumping to the top. */
  private keepFresh(root: HTMLElement): void {
    const opened = Date.now();
    const stop = this.every(BOARD_REFRESH.every, async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - opened > BOARD_REFRESH.for) {
        stop();
        root.querySelector(".board__foot")?.append(" Stopped updating by itself to save calls: tap Refresh.");
        return;
      }
      try {
        const fresh = fragment(boardView(await this.request({ background: true }), this.nav!, true, this.ctx.rail.clock()));
        for (const sel of [".trains", ".board__foot", ".empty"]) {
          const now = root.querySelector(sel);
          const next = fresh.querySelector(sel);
          if (now && next) now.replaceWith(next);
        }
      } catch {
        /* keep what's shown; the next round tries again */
      }
    });
  }
}
