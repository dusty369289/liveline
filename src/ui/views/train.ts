// The train page: its title, the sticky bar (age, refresh, back to the train), the live region and the legend.
import type { StopSummary } from "../../core/engine";
import { destinationName, originName } from "../../core/models";
import type { ServiceResult } from "../../core/rail";
import { hm } from "../../core/time";
import { timeMark } from "../components/marks";
import { type Html, html, raw } from "../html";
import { liveRegion } from "./live-region";

const REFRESH_ICON = raw('<svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');

/** "19:00 London Paddington to Oxford": the page title, and what Recent calls it. */
export function trainTitle(res: ServiceResult): string {
  const s = res.timeline.service;
  const start = s.origins[0]?.time ?? null;
  return `${start != null ? `${hm(start)} ` : ""}${originName(s)} to ${destinationName(s)}`;
}

const legend = html`
  <details class="legend">
    <summary>How to read this</summary>
    <dl class="legend__list">
      <dt><span class="src-actual tnum">${timeMark("actual")}14:41</span></dt><dd><strong>Happened:</strong> reported by Realtime Trains. To the minute on the free plan, to the quarter minute (¼ ½ ¾) with detailed mode.</dd>
      <dt><span class="src-forecast tnum">${timeMark("forecast")}14:41</span></dt><dd><strong>Expected:</strong> Realtime Trains’ forecast. “On time” when it matches the booked time.</dd>
      <dt><span class="src-est tnum">${timeMark("est")}14:41</span></dt><dd><strong>Our guess</strong>, where Realtime Trains gives none. It carries the delay forward and allows for booked recovery time.</dd>
      <dt><span class="tick" aria-hidden="true"></span> Passing points</dt><dd>Timing points the train passes without stopping: junctions and stations it runs through. They're folded between stops (“6 passing points”): tap to open them, and “Fold away” at the top closes them again. Booked times there are working-timetable times, which can be on the half minute (½). Signals aren't in Realtime Trains' data.</dd>
      <dt><span class="train-swatch" aria-hidden="true"></span> The yellow train</dt><dd>Where we think the train is now (its shape is in Settings). Between reports it moves at the booked speed for that section and stops short of the next point until that point is reported. Stops it has passed are filled in.</dd>
    </dl>
  </details>`;

export function trainView(res: ServiceResult, uid: string, at: string, to: string, stop: StopSummary | null, off: StopSummary | null): Html {
  const s = res.timeline.service;
  const start = s.origins[0]?.time ?? null;
  const ends = s.destinations[0]?.time ?? null;
  const label = [s.operatorName, s.headcode ? ` · ${s.headcode}` : "", s.vehicles ? ` · ${s.vehicles} coaches` : "",
    s.leadingClass ? ` · Class ${s.leadingClass}` : "", s.branding ? ` · ${s.branding}` : ""];
  return html`
<article class="stack train" data-train data-uid="${uid}" data-at="${at}" data-to="${to}" data-title="${trainTitle(res)}" data-day="${s.runDate}" data-ends="${ends ?? ""}">
  <header class="train__head">
    <p class="label">${label}</p>
    <h1>${start != null ? html`<span class="tnum">${hm(start)}</span> ` : ""}${originName(s)} to ${destinationName(s)}</h1>
    ${s.units.length ? html`<p class="hint">Units ${s.units.join(", ")}</p>` : ""}
    ${s.mode !== "TRAIN" ? html`<p class="banner" role="note">This is a ${s.mode.replaceAll("_", " ").toLowerCase()}, not a train.</p>` : ""}
  </header>
  <div class="trainbar" data-trainbar>
    <button type="button" class="trainbar__refresh" data-refresh-now aria-label="Refresh now">${REFRESH_ICON}</button>
    <p class="trainbar__age" data-age aria-live="off">Updated just now</p>
    <p class="visually-hidden" data-refresh-note role="status" aria-live="polite"></p>
    <button type="button" class="linkish trainbar__jump" data-jump>Jump to train</button>
  </div>
  <div data-live-region>${liveRegion(res, at, to, stop, off)}</div>
  ${legend}
</article>`;
}
