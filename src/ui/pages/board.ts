// A board page: fetch the board, remember the station, save the journey, and keep a "now" board fresh (gently).
import type { BoardResult } from "../../core/rail";
import { isoDate } from "../../core/time";
import { keepFocus } from "../focus";
import { fragment, type Html } from "../html";
import { boardHash, type Query, queryOf, type RouteName, timeParams, when } from "../routes";
import { type BoardNav, boardView } from "../views/board";
import { problemView } from "../views/home";
import { Page } from "./page";

/**
 * A "now" board updates itself every 2 minutes while on screen, as a background call (it never spends the calls kept
 * for searches), for its first 15 minutes; then it waits for Refresh. Left open on a table it would otherwise cost
 * 30 calls an hour. A round asks only if the answer on screen is at least `every` old (less `slack`, as a timer can
 * fire a moment early against the wall clock), so coming back and the next round never both ask.
 */
export const BOARD_REFRESH = { every: 120_000, for: 15 * 60_000, slack: 500 };

export class BoardPage extends Page {
  readonly tab: RouteName = "unknown"; // no tab lit, as before: a board is a result, not a tab
  private query: Query = queryOf(this.route.params);
  private nav: BoardNav | null = null;
  private live = false;
  private shown: BoardResult | null = null; // the answer on screen

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
      return problemView("Find trains", "That time isn't valid. Use 24-hour time like 17:45.", null, q);
    }
    const force = this.route.params.get("refresh") === "1";
    const res = await this.request({ when: at, force, background: this.automatic });
    if (stale()) return null;
    this.title = res.board.stationName;
    this.shown = res;
    this.nav = this.links(res);
    // "now" only with no time and today's date: a board for another day stays as asked, not refreshed into today's
    this.live = !q.time && (!q.day || q.day === isoDate(this.ctx.rail.clock()));
    if (force) history.replaceState(null, "", boardHash(q)); // don't refetch on back
    return boardView(res, this.nav, this.live, this.ctx.rail.clock());
  }

  mount(root: HTMLElement): void {
    const board = root.querySelector<HTMLElement>("[data-board]");
    if (!board) return; // the "time isn't valid" page
    const d = board.dataset;
    if (d.crs) this.ctx.stations.remember({ name: d.station!, crs: d.crs });
    this.wireSaveJourney(root, d);
    if (this.live) this.keepFresh(board);
  }

  private request(o: { when?: number | null; force?: boolean; background?: boolean }): Promise<BoardResult> {
    const q = this.query;
    return this.ctx.rail.board({ station: q.station!, to: q.to || null, mode: q.mode, showAll: !!q.all, ...o });
  }

  private links(res: BoardResult): BoardNav {
    const q = this.query;
    const t0 = res.board.timeFrom;
    return {
      earlier: boardHash({ ...q, ...timeParams(t0 - 3_600_000) }),
      later: boardHash({ ...q, ...timeParams(t0 + 3_600_000) }),
      refresh: boardHash(q, { refresh: 1 }),
      switch: boardHash({ ...q, mode: q.mode === "arr" ? "dep" : "arr" }),
      all: boardHash({ ...q, all: q.all ? "" : "1" }),
      change: boardHash({ ...q, all: "" }).replace("#/board", "#/"), // the form, filled in
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

  /**
   * Swap in the fresh answer without jumping to the top: the window line and its links, and everything below the
   * header (status, the older-answer note, rows or the empty line, footer), each slot whole. Only into this board: an
   * answer that arrives after you've moved on to another board (the page root is shared) is dropped. A refresh that
   * fails (busy, refused, offline) keeps the answer on screen and redraws the body to say how old it is and why.
   * Nothing is asked while the app is hidden; coming back asks at once if a round was missed meanwhile.
   */
  private keepFresh(board: HTMLElement): void {
    const opened = Date.now();
    let last = opened; // when we last asked
    const draw = (res: BoardResult, problem: string | null, slots: string[]) => {
      const fresh = fragment(boardView(res, this.nav!, true, this.ctx.rail.clock(), problem));
      keepFocus(board, () => { // the train row you're on stays focused through the refresh
        for (const sel of slots) {
          const now = board.querySelector(sel);
          const next = fresh.querySelector(sel);
          if (now && next) now.replaceWith(next);
        }
      });
    };
    let busy = false;
    let stopped = false;
    const due = () => Date.now() - last >= BOARD_REFRESH.every - BOARD_REFRESH.slack;
    const refresh = async () => {
      if (stopped || busy || document.visibilityState !== "visible" || !due()) return;
      if (Date.now() - opened > BOARD_REFRESH.for) {
        stopped = true;
        stop();
        board.querySelector(".board__foot")?.append(" Stopped updating by itself to save calls: tap Refresh.");
        return;
      }
      busy = true;
      last = Date.now();
      try {
        const res = await this.request({ background: true });
        if (!board.isConnected) return;
        this.shown = res;
        this.nav = this.links(res); // a "now" board's window moves on, and Earlier/Later with it
        draw(res, null, ["[data-board-top]", "[data-board-body]"]);
      } catch (e) {
        // Keep what's shown, and say it's older (the window line and links stay that answer's); the next round tries again
        if (!board.isConnected || !this.shown) return;
        draw(this.shown, e instanceof Error && e.message ? e.message : "Realtime Trains didn't answer.", ["[data-board-body]"]);
      } finally {
        busy = false;
      }
    };
    const stop = this.every(BOARD_REFRESH.every, refresh);
    const back = () => void refresh();
    document.addEventListener("visibilitychange", back);
    this.onDispose(() => document.removeEventListener("visibilitychange", back));
  }
}
