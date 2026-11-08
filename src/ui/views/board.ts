// A board: trains from one station in a window, with their live state and platform.
import { booked, type BoardRow, forPassengers, isBus, rowCancelled, statusMessage } from "../../core/models";
import type { BoardResult } from "../../core/rail";
import { shownOf } from "../../core/engine";
import { hm, isoDate, type Ms } from "../../core/time";
import { REFRESH_ICON, STAR_ICON } from "../components/icons";
import { timeMark } from "../components/marks";
import { operatorBadge } from "../components/operators";
import { ago, dayLabel, delayClass, statusNote } from "../format";
import { type Html, html } from "../html";
import { qs } from "../routes";

/** The board's own links: an hour either side, refresh, the other direction, show all, and the search filled in. */
export interface BoardNav { earlier: string; later: string; refresh: string; switch: string; all: string; change: string }

/**
 * A row with no live time is the timetable until this long after its booked time; only then is the missing report
 * worth saying. A report reaches RTT a little after the event (and RTT gives no forecast until a train is activated,
 * nor for another day), so "No report" any sooner reads like a fault where there's none.
 */
const NO_REPORT_AFTER = 2 * 60_000;

/** The live cell and its lateness class, read as the train page reads a time (the engine's Shown, delayClass). */
function status(r: BoardRow, arr: boolean, now: Ms): [Html, string] {
  if (rowCancelled(r)) return [html`Cancelled`, "is-cancelled"];
  const t = arr ? r.arrival : r.departure;
  const s = shownOf(t);
  if (!s || s.time == null || s.source === "booked") {
    if (isBus(r)) return [html``, ""]; // buses aren't reported, and the row already says Bus
    const bk = booked(t);
    return [bk != null && now - bk > NO_REPORT_AFTER ? html`<span class="muted">No report</span>` : html`<span class="muted">Timetable</span>`, ""];
  }
  const cls = delayClass(s);
  if (s.source === "actual") return [html`${timeMark(s.source)}${arr ? "Arr" : "Left"} ${hm(s.time)}`, cls];
  if (s.delayMin) return [html`${timeMark(s.source)}Exp ${hm(s.time)}`, cls];
  return [html`${timeMark(s.source)}On time`, cls];
}

/** Who runs it. With a badge (shown by the Operator colour theme, which then hides the name but leaves it to screen
 *  readers), the badge stands in for the name. */
function operator(r: BoardRow): unknown {
  const badge = operatorBadge(r.operatorCode, r.operatorName);
  return badge && r.operatorName ? html`${badge}<span class="trains__opname">${r.operatorName}</span>` : r.operatorName || "No operator";
}

function meta(r: BoardRow): unknown[] {
  return [
    isBus(r) ? html`<strong>Bus</strong> · ` : "",
    !forPassengers(r) ? html`<strong>Not in service</strong> · ` : "",
    operator(r),
    r.headcode && r.headcode !== "0B00" ? ` · ${r.headcode}` : "",
    r.branding ? ` · ${r.branding}` : "",
    r.vehicles ? ` · ${r.vehicles} coaches` : "",
    // In words too: the plate's mark alone is easy to miss, and it's what a passenger most needs to see
    r.platformChanged ? " · Platform changed" : "",
    statusNote(r.status),
  ];
}

function row(r: BoardRow, res: BoardResult, here: string, now: Ms): Html {
  const arr = res.mode === "arr";
  const [state, liveCls] = status(r, arr, now);
  const cancelled = rowCancelled(r);
  // On arrivals you meet the train here: this station is where it's followed to (you "get off" here), and the "from"
  // station, if any, is where it was boarded. The train page then counts down to it reaching you.
  const stops = arr ? { at: res.to?.crs, to: here } : { at: here, to: res.to?.crs };
  const href = `#/train/${encodeURIComponent(r.uniqueId)}${qs(stops)}`;
  const platCls = `${r.platformChanged ? " is-changed" : ""}${r.platform && !r.platformConfirmed ? " is-unconfirmed" : ""}`;
  // A plain span's aria-label isn't read reliably, so the plate's words are hidden text inside it: "Platform 5, changed"
  const plate = r.platform ? html`<span class="visually-hidden">Platform </span><span class="trains__plat-label" aria-hidden="true">Plat</span>${
    r.platform}<span class="visually-hidden">${r.platformConfirmed ? "" : ", not confirmed"}${r.platformChanged ? ", changed" : ""}</span>` : "";
  return html`
    <li class="trains__row${cancelled ? " is-cancelled" : ""}">
      <a class="trains__link" href="${href}">
        <span class="trains__when"><span class="trains__time tnum">${hm(booked(arr ? r.arrival : r.departure))}</span><span class="trains__live tnum ${liveCls}">${state}</span></span>
        <span class="trains__dest">
          <span class="trains__place">${arr ? html`<span class="muted">from </span>${r.origin}` : r.destination}</span>
          <span class="trains__meta">${meta(r)}</span>
        </span>
        <span class="trains__plat tnum${platCls}">${plate}</span>
      </a>
    </li>`;
}

/**
 * A board. `problem` is why a refresh failed (busy, refused, offline): the answer shown is then the last one, and the
 * older-answer note says so, how old it is, and why.
 */
export function boardView(res: BoardResult, nav: BoardNav, live: boolean, now: Ms, problem: string | null = null): Html {
  const b = res.board;
  const older = problem ? `Not updated: ${problem}` : res.fetched.stale ? `${res.fetched.note}.` : null;
  const arr = res.mode === "arr";
  const here = res.station?.crs ?? b.stationCrs ?? "";
  const other = res.to ? ` ${arr ? "from" : "calling at"} ${res.to.name}` : "";
  const sm = statusMessage(b.status);
  const otherDay = isoDate(b.timeFrom) !== isoDate(now);
  return html`
<div class="stack board" data-board ${live ? html`data-live-board="60"` : ""}
     data-station="${res.station?.name ?? b.stationName}" data-crs="${here}"
     data-to-name="${res.to?.name ?? null}" data-to-crs="${res.to?.crs ?? null}">
  <header class="board__head">
    <div class="board__plate">
      <h1>${b.stationName}</h1>
      ${res.to && res.station ? html`<button type="button" class="board__star" data-save-journey aria-label="Save this journey" aria-pressed="false">${STAR_ICON}</button>` : ""}
    </div>
    <div class="board__slot" data-board-top>
    <p class="board__sub"><a href="${nav.change}">${arr ? "Arrivals" : "Departures"}${other} · ${hm(b.timeFrom)} to ${hm(b.timeTo)}${otherDay ? ` on ${dayLabel(b.timeFrom)}` : ""}<span class="visually-hidden">. Change this search</span></a></p>
    <nav class="board__nav" aria-label="This board">
      <a class="board__step" href="${nav.earlier}"><span aria-hidden="true">‹\u00a0</span>Earlier</a>
      <a class="board__step" href="${nav.later}">Later<span aria-hidden="true">\u00a0›</span></a>
      <a class="board__step" href="${nav.switch}">${arr ? "Departures" : "Arrivals"}</a>
      <a class="board__refresh" href="${nav.refresh}" data-board-refresh aria-label="Refresh" title="Refresh">${REFRESH_ICON}</a>
    </nav>
    </div>
    ${res.to && res.station ? html`<p class="hint" data-save-note role="status" aria-live="polite"></p>` : ""}
  </header>
  <div class="board__slot" data-board-body>
  ${sm ? html`<p class="banner" role="note">${sm}</p>` : ""}
  ${older ? html`<p class="hint">Showing the answer from ${ago((now - res.fetched.fetchedAt) / 1000)}. ${older}</p>` : ""}
  ${res.rows.length === 0
    ? html`<p class="empty">No ${arr ? "arrivals" : "departures"} in this hour${other}. Try <a href="${nav.later}">later</a>.</p>`
    : html`<ol class="trains" aria-label="Trains">${res.rows.map((r) => row(r, res, here, now))}</ol>`}
  <p class="hint board__foot">Updated ${hm(res.fetched.fetchedAt)}${live ? ", and every 2 minutes while open" : ""}.${
    res.hidden ? html` ${res.hidden} empty or staff-only train${res.hidden !== 1 ? "s" : ""} hidden: <a href="${nav.all}">show all</a>.`
      : res.showAll ? html` <a href="${nav.all}">Passenger trains only</a>.` : ""}</p>
  </div>
</div>`;
}
