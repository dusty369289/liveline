// The search page, and the page shown when something can't be shown.
import { searchForm } from "../components/search-form";
import { type Html, html } from "../html";
import { type Query, qs } from "../routes";
import type { Journey, StationRef } from "../store/lists";
import type { RecentTrain } from "../store/recent-trains";

export interface HomeData {
  query: Query;
  carry: RecentTrain | null; // the newest train still running: one line, so the form never moves
  journeys: Journey[];
  stations: StationRef[];
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
  <h1>Where are you catching a train?</h1>
  ${searchForm(d.query)}
  <p class="hint">Tip: put a station in “Calling at” and you can save the journey for one-tap use, both ways.</p>
  ${d.stations.length ? html`<section class="recent" aria-labelledby="recent-h">
    <h2 id="recent-h" class="label">Recent stations</h2>
    <ul class="recent__list cluster">${d.stations.map((s) => html`<li><a href="#/board${qs({ station: s.crs })}">${s.name}</a></li>`)}</ul>
  </section>` : ""}
</div>`;
}

export function problemView(title: string, message: string, busy: boolean, q: Query | null = null): Html {
  return html`
<div class="stack">
  <h1>${title}</h1>
  <p class="problem" role="alert">${message}</p>
  ${busy ? html`<p class="hint">This page tries again by itself in 30 seconds.</p>` : ""}
  ${q ? searchForm(q) : html`<p><a href="#/">Search again</a></p>`}
</div>`;
}
