// The train page: its title, the sticky bar (age, refresh, back to the train), the live region and the legend.
import { destinationName, originName } from "../../core/models";
import type { ServiceResult } from "../../core/rail";
import type { StopSummary } from "../../core/stops";
import { hm, type Ms } from "../../core/time";
import { REFRESH_ICON } from "../components/icons";
import { timeMark } from "../components/marks";
import { runDay } from "../format";
import { type Html, html } from "../html";
import { TRAIN_TABS, type TrainTabName } from "../store/train-tab";
import { liveRegion } from "./live-region";


/** "19:00 London Paddington to Oxford": the page title, and what Recent calls it. */
export function trainTitle(res: ServiceResult): string {
  const s = res.timeline.service;
  const start = s.origins[0]?.time ?? null;
  return `${start != null ? `${hm(start)} ` : ""}${originName(s)} to ${destinationName(s)}`;
}

const legend = html`
  <details class="legend disclosure">
    <summary>How to read this</summary>
    <dl class="legend__list">
      <dt><span class="src-actual tnum">${timeMark("actual")}14:41</span></dt><dd><strong>Happened:</strong> reported by Realtime Trains. To the minute on the free plan, to the quarter minute (¼ ½ ¾) with detailed mode.</dd>
      <dt><span class="src-forecast tnum">${timeMark("forecast")}14:41</span></dt><dd><strong>Expected:</strong> Realtime Trains’ forecast. “On time” when it matches the booked time.</dd>
      <dt><span class="src-est tnum">${timeMark("est")}14:41</span></dt><dd><strong>Our guess</strong>, where Realtime Trains gives none. It carries the delay forward and allows for booked recovery time.</dd>
      <dt><span class="tick" aria-hidden="true"></span> Passing points</dt><dd>Timing points the train passes without stopping: junctions and stations it runs through. They're folded between stops (“6 passing points”): tap to open them, and “Fold away” at the top closes them again. Booked times there are working-timetable times, which can be on the half minute (½). Signals aren't in Realtime Trains' data.</dd>
      <dt><span class="train-swatch" aria-hidden="true"></span> The yellow train</dt><dd>Where we think the train is now (its shape is in Settings). Between reports it moves at the booked speed for that section and stops short of the next point until that point is reported. Stops it has passed are filled in.</dd>
    </dl>
  </details>`;

const tabs = (tab: TrainTabName) => html`
  <div class="tabs" role="tablist" aria-label="Show the train as" data-train-tabs>${TRAIN_TABS.map(([name, label]) => html`
    <button type="button" class="tabs__tab" role="tab" id="tab-${name}" data-tab="${name}" aria-controls="panel-${name}"
      aria-selected="${tab === name ? "true" : "false"}" tabindex="${tab === name ? "0" : "-1"}">${label}</button>`)}
  </div>`;

export interface TrainViewOpts { tab: TrainTabName; scene: Html; now: Ms }

export function trainView(res: ServiceResult, uid: string, at: string, to: string, stop: StopSummary | null, off: StopSummary | null,
  opts: TrainViewOpts): Html {
  const s = res.timeline.service;
  const start = s.origins[0]?.time ?? null;
  const ends = s.destinations[0]?.time ?? null;
  const day = runDay(s.runDate, opts.now);
  const label = [s.operatorName, s.headcode ? ` · ${s.headcode}` : "", s.vehicles ? ` · ${s.vehicles} coaches` : "",
    s.branding ? ` · ${s.branding}` : ""];
  return html`
<article class="stack train" data-train data-uid="${uid}" data-at="${at}" data-to="${to}" data-title="${trainTitle(res)}" data-day="${s.runDate}" data-ends="${ends ?? ""}">
  <header class="train__head">
    <p class="label">${label}</p>
    <h1>${start != null ? html`<span class="tnum">${hm(start)}</span> ` : ""}${originName(s)} to ${destinationName(s)}${day ? ` · ${day}` : ""}</h1>
    ${s.mode !== "TRAIN" ? html`<p class="banner" role="note">This is a ${s.mode.replaceAll("_", " ").toLowerCase()}, not a train.</p>` : ""}
  </header>
  <div class="trainbar" data-trainbar>
    <button type="button" class="trainbar__refresh" data-refresh-now aria-label="Refresh now">${REFRESH_ICON}</button>
    <p class="trainbar__age" data-age aria-live="off">Updated just now</p>
    <p class="visually-hidden" data-refresh-note role="status" aria-live="polite"></p>
    <button type="button" class="linkish trainbar__jump" data-jump>Jump to train</button>
  </div>
  ${tabs(opts.tab)}
  <div class="stack" id="panel-route" role="tabpanel" aria-labelledby="tab-route" ${opts.tab === "route" ? "" : html`hidden`}>
    <div data-live-region>${liveRegion(res, stop, off)}</div>
    ${legend}
  </div>
  ${opts.scene}
</article>`;
}
