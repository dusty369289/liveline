// The search page, and the page shown when something can't be shown.
import { hm, type Ms } from "../../core/time";
import { REFRESH_ICON, STAR_ICON } from "../components/icons";
import { searchForm } from "../components/search-form";
import { longDay, plural } from "../format";
import { type Html, html, raw } from "../html";
import type { Query } from "../routes";
import type { Journey } from "../store/lists";
import type { Glance, RecentTrain } from "../store/recent-trains";
import { countText } from "./live-region";

export interface HomeData {
  query: Query;
  carry: RecentTrain | null; // the newest train still running: one line, so the form never moves
  journeys: Journey[]; // one line to their page, the same height however many
  // (recent stations are offered in the station box itself: StationSuggest)
  now: Ms;
}

/**
 * Seconds the search page's train must have stood before its refresh asks Realtime Trains again (owner, 2026-11-08:
 * a hard floor). Sooner, a tap costs nothing: what's shown is that fresh already, and its "as of" says so.
 */
export const GLANCE_REFRESH_MIN = 60;
export const glanceRefreshDue = (asOf: Ms, now: Ms): boolean => now - asOf >= GLANCE_REFRESH_MIN * 1000;

/** A train's number is worth showing until a couple of minutes past its time; after that it's the clock. */
const GLANCE_STALE_AFTER = 2 * 60_000;

const CROSS = raw('<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>');

/** "7 min late", "2 min early", "On time", or nothing to say. */
const lateness = (late: number | null) =>
  late == null ? "" : late > 0 ? `${late} min late` : late < 0 ? `${-late} min early` : "On time";

/** The train you're on, as the train page last counted it: its big number, ticked on by the page (Countdowns). */
function glanceView(t: RecentTrain, g: Glance, now: Ms): Html {
  const n = countText(g.due, now, true);
  const said = [lateness(g.late), `as of ${hm(g.asOf)}`].filter(Boolean).join(" · ");
  return html`
  <section class="home__glance" aria-labelledby="glance-h">
    <div class="home__glance-head">
      <h2 id="glance-h" class="home__glance-label">Your train<span class="home__glance-title"> · ${t.title}</span></h2>
      <button type="button" class="home__refresh" data-refresh-train="${t.href}" aria-label="Refresh your train" title="Refresh">${REFRESH_ICON}</button>
      <button type="button" class="home__dismiss" data-dismiss-train="${t.href}" aria-label="Stop showing this train here" title="Not on this train">${CROSS}</button>
    </div>
    <a class="home__glance-go" href="${t.href}"><p class="live__hero">${n === "Due"
      ? html`<span class="live__hero-num">Due</span><span class="live__hero-what">at ${g.stop}</span>`
      : html`<span class="live__hero-num" data-count-at="${g.due}">${n}</span><span class="live__hero-unit">min</span>
        <span class="live__hero-what" data-due-what="at ${g.stop}">until it ${g.verb} ${g.stop}</span><span class="live__hero-at tnum"><span class="visually-hidden">at </span>${hm(g.due)}</span>`}</p></a>
    <p class="hint home__glance-said" data-glance-said>${said}</p>
  </section>`;
}

/** No train to show: the time and the day, ticked on by the page. */
const clockView = (now: Ms) => html`
  <p class="home__clock"><span class="home__time tnum" data-clock>${hm(now)}</span><span class="home__date" data-date>${longDay(now)}</span></p>`;

/**
 * The room above the heading: your train while it has a number to show, otherwise the clock. Shown only with the tabs
 * at the bottom of a tall screen (block/tabs.css); drawn again on its own by a refresh or a dismissal, so a half-typed
 * search below it is kept.
 */
export function homeTop(carry: RecentTrain | null, now: Ms): Html {
  const g = carry?.glance;
  return carry && g && g.due > now - GLANCE_STALE_AFTER ? glanceView(carry, g, now) : clockView(now);
}

export function homeView(d: HomeData): Html {
  // With your train above, the Carry on line under the heading would say it twice: it hides there (block/tabs.css), and
  // stays for everyone else
  return html`
<div class="stack home">
  <div class="home__top" data-home-top>${homeTop(d.carry, d.now)}</div>
  <h1>Find your train</h1>
  ${d.carry ? html`<a class="carry" href="${d.carry.href}"><span class="carry__label">Carry on</span><span class="carry__title">${d.carry.title}</span></a>` : ""}
  ${d.journeys.length ? html`<a class="carry carry--saved" href="#/journeys">${STAR_ICON}<span class="carry__label">Saved journeys</span><span class="carry__title">${plural(d.journeys.length, "journey")}</span></a>` : ""}
  ${searchForm(d.query)}
  ${d.journeys.length ? "" : html`<p class="hint">Tip: put a station in “Calling at” and you can save the journey for one-tap use.</p>`}
</div>`;
}

/**
 * A busy page tries again by itself after `secs` (ProblemPage, longer after each failure), or at `at`, the time
 * Realtime Trains gave, when that's later: one wait, never two.
 */
export interface Retry { secs: number; at: Ms | null }

/**
 * `retry`: when the page tries again by itself, or null when it won't. `tryAgain` offers "Try again", for a failure
 * nobody planned for (which might not happen twice). `announce`: the message is an alert; off when the page redraws
 * itself (a busy page's retry), so a screen reader isn't interrupted again with what it already heard.
 */
export function problemView(title: string, message: string, retry: Retry | null, q: Query | null = null, tryAgain = false,
  announce = true): Html {
  const wait = retry == null ? "" : retry.at != null ? `at ${hm(retry.at)}`
    : `in ${retry.secs < 60 ? `${retry.secs} seconds` : plural(Math.round(retry.secs / 60), "minute")}`;
  return html`
<div class="stack">
  <h1>${title}</h1>
  ${announce ? html`<p class="problem" role="alert">${message}</p>` : html`<p class="problem">${message}</p>`}
  ${wait ? html`<p class="hint">This page tries again by itself ${wait}.</p>` : ""}
  ${tryAgain ? html`<p><button type="button" class="linkish" data-retry>Try again</button></p>` : ""}
  ${q ? searchForm(q) : html`<p><a class="problem__search" href="#/">Search again</a></p>`}
</div>`;
}
