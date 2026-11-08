// The search page, and the page shown when something can't be shown.
import { hm, type Ms } from "../../core/time";
import { searchForm } from "../components/search-form";
import { plural } from "../format";
import { type Html, html } from "../html";
import { boardHash, type Query } from "../routes";
import type { Journey } from "../store/lists";
import type { RecentTrain } from "../store/recent-trains";

export interface HomeData {
  query: Query;
  carry: RecentTrain | null; // the newest train still running: one line, so the form never moves
  journeys: Journey[]; // (recent stations are offered in the station box itself: StationSuggest)
}

export function homeView(d: HomeData): Html {
  return html`
<div class="stack home">
  <h1>Find your train</h1>
  ${d.carry ? html`<a class="carry" href="${d.carry.href}"><span class="carry__label">Carry on</span><span class="carry__title">${d.carry.title}</span></a>` : ""}
  ${d.journeys.length ? html`<section class="journeys" aria-labelledby="journeys-h">
    <h2 id="journeys-h" class="label">My journeys</h2>
    <ul class="journeys__list">${d.journeys.map((j) => html`
      <li class="journeys__item">
        <a class="journeys__go" href="${boardHash({ station: j.from, to: j.to })}">${j.fromName} → ${j.toName}</a>
        <a class="journeys__back" href="${boardHash({ station: j.to, to: j.from })}" aria-label="Return: ${j.toName} to ${j.fromName}">Return</a>
      </li>`)}</ul>
  </section>` : ""}
  ${searchForm(d.query)}
  ${d.journeys.length ? "" : html`<p class="hint">Tip: put a station in “Calling at” and you can save the journey for one-tap use, both ways.</p>`}
</div>`;
}

/**
 * A busy page tries again by itself after `secs` (ProblemPage, longer after each failure), or at `at`, the time
 * Realtime Trains gave, when that's later: one wait, never two.
 */
export interface Retry { secs: number; at: Ms | null }

/**
 * `retry`: when the page tries again by itself, or null when it won't. `tryAgain` offers "Try again", for a failure
 * nobody planned for (which might not happen twice).
 */
export function problemView(title: string, message: string, retry: Retry | null, q: Query | null = null, tryAgain = false): Html {
  const wait = retry == null ? "" : retry.at != null ? `at ${hm(retry.at)}`
    : `in ${retry.secs < 60 ? `${retry.secs} seconds` : plural(Math.round(retry.secs / 60), "minute")}`;
  return html`
<div class="stack">
  <h1>${title}</h1>
  <p class="problem" role="alert">${message}</p>
  ${wait ? html`<p class="hint">This page tries again by itself ${wait}.</p>` : ""}
  ${tryAgain ? html`<p><button type="button" class="linkish" data-retry>Try again</button></p>` : ""}
  ${q ? searchForm(q) : html`<p><a class="problem__search" href="#/">Search again</a></p>`}
</div>`;
}
