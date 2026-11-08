// The search page, and the page shown when something can't be shown.
import { hm, type Ms } from "../../core/time";
import { searchForm } from "../components/search-form";
import { type Html, html } from "../html";
import { type Query, qs } from "../routes";
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
  ${d.carry ? html`<a class="carry" href="${d.carry.href}"><span class="carry__label">Carry on</span><span class="carry__title">${d.carry.title}</span></a>` : ""}
  ${d.journeys.length ? html`<section class="journeys" aria-labelledby="journeys-h">
    <h2 id="journeys-h" class="label">My journeys</h2>
    <ul class="journeys__list">${d.journeys.map((j) => html`
      <li class="journeys__item">
        <a class="journeys__go" href="#/board${qs({ station: j.from, to: j.to })}">${j.fromName} → ${j.toName}</a>
        <a class="journeys__back" href="#/board${qs({ station: j.to, to: j.from })}" aria-label="Return: ${j.toName} to ${j.fromName}">Return</a>
      </li>`)}</ul>
  </section>` : ""}
  <h1>Find your train</h1>
  ${searchForm(d.query)}
  ${d.journeys.length ? "" : html`<p class="hint">Tip: put a station in “Calling at” and you can save the journey for one-tap use, both ways.</p>`}
</div>`;
}

/** How often a busy page asks again by itself: a freed call shows up soon, and a refusal costs no call. */
export const RETRY_SECONDS = 30;

/** A busy page tries again by itself: at the time Realtime Trains gave, or every RETRY_SECONDS. */
export interface Retry { at: Ms | null }

export function problemView(title: string, message: string, retry: Retry | null, q: Query | null = null): Html {
  return html`
<div class="stack">
  <h1>${title}</h1>
  <p class="problem" role="alert">${message}</p>
  ${retry ? html`<p class="hint">This page tries again by itself ${retry.at != null ? `at ${hm(retry.at)}` : `every ${RETRY_SECONDS} seconds`}.</p>` : ""}
  ${q ? searchForm(q) : html`<p><a href="#/">Search again</a></p>`}
</div>`;
}
