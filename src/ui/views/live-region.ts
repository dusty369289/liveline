// The part of the train page that refreshes: where the train is, your stops, and the route with every point.
import { changed, minutesUntil, type PointView, type StopSummary, type Timeline } from "../../core/engine";
import { isCancelled } from "../../core/models";
import type { ServiceResult } from "../../core/rail";
import { hm, isoDate, type Ms } from "../../core/time";
import { markOf, timeMark } from "../components/marks";
import { dayLabel, delayClass, hmh, plural } from "../format";
import { type Html, html, raw } from "../html";

const CHEVRON = raw('<svg class="route__fold-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>');

/** Past this many minutes a countdown stops helping ("2805 min"): the time (and day) is given instead. */
const HERO_COUNTDOWN_MAX = 180;

/** Too far off to count down to: the big number and the stop lines give the time instead. */
const farOff = (sm: StopSummary) => sm.status === "ahead" && (sm.minutes ?? 0) > HERO_COUNTDOWN_MAX;

/**
 * The day beside a stop's time, only when it isn't the day the train runs (the title carries that one): a stop just
 * after midnight on an overnight train.
 */
const dayBeside = (t: Ms | null, runDate: string) => (t != null && isoDate(t) !== runDate ? dayLabel(t) : "");

/**
 * A countdown to `t` as it reads at `now`: the big number (`big`) or a stop line's "in N min". "Due" under a minute;
 * past HERO_COUNTDOWN_MAX the time instead (nothing, in a line). The page draws with it, and live-train.ts redraws
 * every `data-count-at` with it each second between polls, so the two can't drift.
 */
export function countText(t: Ms, now: Ms, big: boolean): string {
  const m = minutesUntil(t, now);
  if (m > HERO_COUNTDOWN_MAX) return big ? hm(t) : "";
  if (m < 1) return big ? "Due" : ", due now";
  return big ? String(m) : `, in ${m} min`;
}

/** The one number you came for: minutes until it leaves your stop (or reaches where you get off). */
function hero(stop: StopSummary | null, off: StopSummary | null, runDate: string, now: Ms): [Html | "", StopSummary | null] {
  const hs = stop && ["ahead", "here"].includes(stop.status) ? stop : off && off.status === "ahead" ? off : null;
  if (!hs) return ["", null];
  const isStop = hs === stop;
  const plat = hs.platform && isStop ? `, platform ${hs.platform}` : "";
  const t = hs.shown?.time ?? null;
  const day = dayBeside(t, runDate);
  const dueWhat = `at ${hs.name}${plat}`;
  let inner: Html | "" = "";
  // Only a far-off train loses its countdown: one just past midnight still counts down
  if (t != null && farOff(hs)) {
    inner = html`<span class="live__hero-num">${hm(t)}</span>${day ? html`<span class="live__hero-unit">${day}</span>` : ""}
      <span class="live__hero-what">when it ${isStop ? "leaves" : "reaches"} ${hs.name}${plat}</span>`;
  } else if (hs.status === "here") inner = html`<span class="live__hero-num">Now</span><span class="live__hero-what">at ${hs.name}${hs.platform ? `, platform ${hs.platform}` : ""}</span>`;
  else if (t != null && hs.minutes != null) {
    const n = countText(t, now, true);
    // The tick turns the number into "Due" on its own: it drops the unit and swaps in the shorter line it keeps here
    inner = n === "Due" ? html`<span class="live__hero-num">Due</span><span class="live__hero-what">${dueWhat}</span>`
      : html`<span class="live__hero-num" data-count-at="${t}">${n}</span><span class="live__hero-unit">min</span>
      <span class="live__hero-what" data-due-what="${dueWhat}">until it ${isStop ? "leaves" : "reaches"} ${hs.name} · ${hm(t)}${hs.platform && isStop ? ` · platform ${hs.platform}` : ""}</span>`;
  }
  return [html`<p class="live__hero">${inner}</p>`, hs];
}

function stopLine(sm: StopSummary, verb: "leaves" | "reaches", runDate: string, now: Ms): Html {
  let body: Html;
  if (sm.status === "cancelled") body = html`<span class="problem">It no longer stops at ${sm.name}.</span>`;
  else if (sm.status === "here") body = html`<strong>It's at ${sm.name} now</strong>${sm.platform ? `, platform ${sm.platform}` : ""}.`;
  else if (sm.status === "gone") {
    body = html`It has ${verb === "leaves" ? "left" : "reached"} ${sm.name}${sm.shown && sm.shown.source === "actual" ? ` (${hm(sm.shown.time)})` : ""}.`;
  } else {
    const t = sm.shown?.time ?? null;
    const day = dayBeside(t, runDate);
    body = html`It ${verb} <strong>${sm.name}</strong> at <strong class="tnum ${delayClass(sm.shown)}">${t != null ? hm(t) : "?"}</strong>${
      day ? ` ${day}` : ""}${t != null && sm.minutes != null ? html`<span data-count-at="${t}">${countText(t, now, false)}</span>` : ""}${sm.callsBetween ? `, ${sm.callsBetween} stop${sm.callsBetween !== 1 ? "s" : ""} away` : ""}${
      sm.platform && verb === "leaves" ? `, platform ${sm.platform}${sm.platformConfirmed ? "" : " (not confirmed)"}` : ""}.`;
  }
  return html`<p class="live__stop">${body}</p>`;
}

/**
 * Runs of passing points between two stops, each named by its first point's index (so its open/closed state
 * survives a refresh: live-train.ts keeps it).
 */
export function passGroups(tl: Timeline): { groupOf: Map<number, number>; size: Map<number, number> } {
  const groupOf = new Map<number, number>();
  const size = new Map<number, number>();
  let current = -1;
  for (const v of tl.points) {
    if (v.point.kind !== "pass") current = -1;
    else {
      if (current < 0) current = v.index;
      groupOf.set(v.index, current);
      size.set(current, (size.get(current) ?? 0) + 1);
    }
  }
  return { groupOf, size };
}

const foldRow = (g: number, n: number) => html`
    <li class="route__fold" data-fold="${g}">
      <span class="route__mark" aria-hidden="true"></span>
      <button type="button" class="route__fold-btn" data-fold-toggle="${g}" aria-expanded="false">${CHEVRON}<span data-fold-label>${plural(n, "passing point")}</span></button>
    </li>`;

function pointMeta(v: PointView): unknown {
  const pt = v.point;
  if (isCancelled(pt)) return html`<span class="problem">${pt.display === "DIVERTED" ? "Diverted away" : "Cancelled here"}</span>`;
  const longDwell = pt.kind === "call" && v.arrival?.booked != null && v.departure?.booked != null && v.departure.booked - v.arrival.booked >= 120_000;
  const status = { APPROACHING: " · Approaching", AT_PLATFORM: " · At platform", DEPART_READY: " · Ready to leave", DEPARTING: " · Leaving" } as Record<string, string>;
  return [
    pt.kind === "call" && pt.platform ? html`Plat ${pt.platform}${pt.platformChanged ? html` <span class="is-changed">changed</span>` : ""}` : "",
    longDwell ? ` · arr ${hm(v.arrival!.time)}` : "",
    pt.requestStop ? " · Request stop" : "",
    !pt.public && pt.kind === "call" ? " · Not for passengers" : "",
    status[pt.status ?? ""] ?? "",
  ];
}

/** Booked time, then the live one with its mark. On time shows once ("On time" at a stop, just the mark at a junction). */
function pointTimes(v: PointView): Html {
  const pt = v.point;
  const main = pt.kind === "pass" ? v.passing : (v.departure ?? v.arrival);
  if (!main) return html`<span class="route__booked"></span><span class="route__live"></span>`;
  let shown: Html | "" = "";
  if (!isCancelled(pt) && main.source !== "booked") {
    const predicted = main.source === "forecast" || main.source === "est";
    if (predicted && !changed(main)) {
      shown = pt.kind === "call" ? html`${timeMark(main.source)}<span class="route__ontime">On time</span>`
        : html`${timeMark(main.source)}<span class="visually-hidden">on time</span>`;
    } else {
      shown = html`${timeMark(main.source)}${main.source === "est" ? hm(main.time) : hmh(main.time)}${
        main.delayMin ? html`<span class="route__delay">${main.delayMin > 0 ? "+" : "−"}${Math.abs(main.delayMin)}</span>` : ""}`;
    }
  }
  return html`<span class="route__booked tnum">${pt.kind === "pass" ? hmh(main.booked) : hm(main.booked)}</span><span class="route__live tnum ${delayClass(main)} src-${main.source === "booked" ? "booked" : markOf(main.source)}">${shown}</span>`;
}

function pointRow(v: PointView, at: string, to: string, group: number | undefined): Html {
  const pt = v.point;
  const isAt = !!at && (pt.crs === at || pt.tiploc === at);
  const isTo = !!to && (pt.crs === to || pt.tiploc === to);
  const tin = v.passing ?? v.arrival ?? v.departure;
  const tout = v.passing ?? v.departure ?? v.arrival;
  const cls = [pt.kind === "pass" ? "is-pass is-folded" : "is-call", v.reported ? "is-reported" : "", isCancelled(pt) ? "is-cancelled" : "",
    isAt ? "is-at" : "", isTo ? "is-to" : "", !pt.public && pt.kind === "call" ? "is-operational" : ""].filter(Boolean).join(" ");
  const tag = isAt ? html`<span class="route__tag">Board</span>` : isTo ? html`<span class="route__tag">Alight</span>` : "";
  return html`
    <li class="route__pt ${cls}" data-index="${v.index}" data-group="${group ?? null}" id="${isAt ? "your-stop" : null}" data-t-in="${tin?.time ?? ""}" data-t-out="${tout?.time ?? ""}">
      <span class="route__mark" aria-hidden="true"></span>
      <span class="route__name"><span class="route__place">${pt.name}</span><span class="route__meta">${tag}${pointMeta(v)}</span></span>
      ${pointTimes(v)}
    </li>`;
}

export function liveRegion(res: ServiceResult, at: string, to: string, stop: StopSummary | null, off: StopSummary | null): Html {
  const tl = res.timeline;
  const p = tl.position;
  const runDate = tl.service.runDate;
  const [heroHtml, hs] = hero(stop, off, runDate, tl.now);
  // Once it has arrived, the headline says so: "It has left X / It has reached Y" would only repeat it
  const lines = p.state === "arrived" ? []
    : ([[stop, "leaves"], [off, "reaches"]] as const).filter(([sm]) => sm && sm !== hs).map(([sm, v]) => stopLine(sm!, v, runDate, tl.now));
  const { groupOf, size } = passGroups(tl);
  const route = tl.points.map((v) => {
    const g = groupOf.get(v.index);
    return html`${g === v.index ? foldRow(g, size.get(g) ?? 0) : ""}${pointRow(v, at, to, g)}`;
  });
  return html`
<section class="live" aria-labelledby="live-h" data-state="${p.state}" data-from="${p.fromIndex ?? ""}" data-to="${p.toIndex ?? ""}"
  data-since="${p.since ?? ""}" data-expected="${p.expected ?? ""}" data-fraction="${p.fraction.toFixed(3)}" data-hold="0.95"
  data-refresh="${res.refreshAfter == null ? "" : Math.floor(res.refreshAfter)}" data-fetched="${res.fetched.fetchedAt}">
  <div class="live__status" role="status">
    <h2 id="live-h" class="visually-hidden">Where the train is</h2>
    ${heroHtml}
    ${hs && hs.index === p.toIndex && p.state === "not-started" ? "" /* the big number already says when it leaves */
      : html`<p class="live__headline state-${p.state}">${p.headline}</p>`}
    ${lines}
    ${tl.worst ? html`<p class="live__stop hint">Lost most time between ${tl.worst.fromName} and ${tl.worst.toName} (${tl.worst.minutes} min).</p>` : ""}
    ${res.fetched.stale ? html`<p class="live__age hint">Showing an older answer: ${res.fetched.note}.</p>` : ""}
  </div>
  ${tl.service.reasons.length ? html`<ul class="reasons">${tl.service.reasons.map((r) => html`<li>${r.kind === "CANCEL" ? "Cancelled" : "Delayed"} because of ${r.text.slice(0, 1).toLowerCase() + r.text.slice(1)}.</li>`)}</ul>` : ""}
  <div class="route-wrap">
    <ol class="route" aria-label="Route">${route}</ol>
    <div class="route__train" data-train-marker hidden aria-hidden="true"></div>
  </div>
</section>`;
}
