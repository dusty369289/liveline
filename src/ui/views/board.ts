// A board: trains from one station in a window, with their live state and platform.
import { booked, type BoardRow, forPassengers, isBus, rowCancelled, statusMessage } from "../../core/models";
import type { BoardResult } from "../../core/rail";
import { hm, isoDate, type Ms } from "../../core/time";
import { timeMark } from "../components/marks";
import { ago, dayLabel } from "../format";
import { type Html, html } from "../html";
import { type Query, qs } from "../routes";

/** The board's own links: an hour either side, refresh, the other direction, show all. */
export interface BoardNav { earlier: string; later: string; refresh: string; switch: string; all: string }

function status(r: BoardRow, arr: boolean): [Html, string] {
  const t = arr ? r.arrival : r.departure;
  const liveT = t.actual ?? t.forecast ?? t.estimate;
  const bk = booked(t);
  const mins = liveT != null && bk != null ? Math.floor((liveT - bk) / 60_000) : 0;
  if (rowCancelled(r)) return [html`Cancelled`, "is-cancelled"];
  const cls = mins >= 5 ? "is-very-late" : mins >= 2 ? "is-late" : "";
  if (t.actual != null) return [html`${timeMark("actual")}${arr ? "Arr" : "Left"} ${hm(t.actual)}`, cls];
  if (liveT != null && mins >= 1) return [html`${timeMark("forecast")}Exp ${hm(liveT)}`, cls];
  if (liveT != null) return [html`${timeMark("forecast")}On time`, cls];
  return [html`<span class="muted">No report</span>`, cls];
}

function meta(r: BoardRow): unknown[] {
  return [
    isBus(r) ? html`<strong>Bus</strong> · ` : "",
    !forPassengers(r) ? html`<strong>Not in service</strong> · ` : "",
    r.operatorName || "No operator",
    r.headcode && r.headcode !== "0B00" ? ` · ${r.headcode}` : "",
    r.branding ? ` · ${r.branding}` : "",
    r.vehicles ? ` · ${r.vehicles} coaches` : "",
    r.status === "APPROACHING" ? " · Approaching" : ["AT_PLATFORM", "DEPART_PREPARING", "DEPART_READY"].includes(r.status ?? "") ? " · At platform" : "",
    // In words too: the plate's mark alone is easy to miss, and it's what a passenger most needs to see
    r.platformChanged ? " · Platform changed" : "",
  ];
}

function row(r: BoardRow, res: BoardResult, here: string): Html {
  const arr = res.mode === "arr";
  const [state, liveCls] = status(r, arr);
  const cancelled = rowCancelled(r);
  const href = `#/train/${encodeURIComponent(r.uniqueId)}${qs({ at: here, to: res.to?.crs })}`;
  const platCls = `${r.platformChanged ? " is-changed" : ""}${r.platform && !r.platformConfirmed ? " is-unconfirmed" : ""}`;
  const platLabel = r.platform ? `Platform ${r.platform}${r.platformConfirmed ? "" : ", not confirmed"}` : null;
  return html`
    <li class="trains__row${cancelled ? " is-cancelled" : ""}">
      <a class="trains__link" href="${href}">
        <span class="trains__when"><span class="trains__time tnum">${hm(booked(arr ? r.arrival : r.departure))}</span><span class="trains__live tnum ${liveCls}">${state}</span></span>
        <span class="trains__dest">
          <span class="trains__place">${arr ? r.origin : r.destination}</span>
          <span class="trains__meta">${meta(r)}</span>
        </span>
        <span class="trains__plat tnum${platCls}" aria-label="${platLabel}">${r.platform ? html`<span class="trains__plat-label" aria-hidden="true">Plat</span>${r.platform}` : ""}</span>
      </a>
    </li>`;
}

export function boardView(res: BoardResult, q: Query, nav: BoardNav, live: boolean, now: Ms): Html {
  const b = res.board;
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
    <h1>${b.stationName}</h1>
    <p class="board__sub">${arr ? "Arrivals" : "Departures"}${other}, ${hm(b.timeFrom)} to ${hm(b.timeTo)}${otherDay ? ` on ${dayLabel(b.timeFrom)}` : ""}</p>
    <p class="cluster board__nav">
      <a class="board__step" href="${nav.earlier}"><span aria-hidden="true">‹\u00a0</span>Earlier</a>
      <a class="board__step" href="${nav.later}">Later<span aria-hidden="true">\u00a0›</span></a>
      <a href="${nav.refresh}" data-board-refresh>Refresh</a>
      <a href="${nav.switch}">${arr ? "Departures" : "Arrivals"}</a>
      <a href="#/${qs({ station: q.station })}">Change</a>
    </p>
    ${res.to && res.station ? html`<p class="board__save"><button type="button" class="linkish" data-save-journey>Save this journey</button>
      <span class="hint" data-save-note role="status" aria-live="polite"></span></p>` : ""}
  </header>
  ${sm ? html`<p class="banner" role="note">${sm}</p>` : ""}
  ${res.fetched.stale ? html`<p class="hint">Showing the answer from ${ago((now - res.fetched.fetchedAt) / 1000)}. ${res.fetched.note}.</p>` : ""}
  ${res.rows.length === 0
    ? html`<p class="empty">No ${arr ? "arrivals" : "departures"} in this hour${other}. Try <a href="${nav.later}">later</a>.</p>`
    : html`<ol class="trains" aria-label="Trains">${res.rows.map((r) => row(r, res, here))}</ol>`}
  <p class="hint board__foot">Updated ${hm(res.fetched.fetchedAt)}${live ? ", updates every 2 minutes while open" : ""}. An outlined platform isn't confirmed yet.${
    res.hidden ? html` ${res.hidden} empty or staff-only train${res.hidden !== 1 ? "s" : ""} hidden: <a href="${nav.all}">show all</a>.`
      : res.showAll ? html` <a href="${nav.all}">Passenger trains only</a>.` : ""}</p>
</div>`;
}
