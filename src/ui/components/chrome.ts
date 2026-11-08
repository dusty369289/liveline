// Around every page: the top bar, the banners (demo, allowance, a new version), main, and the footer.
import type { BudgetState } from "../../core/budget";
import { type Html, html, raw } from "../html";
import type { RouteName } from "../routes";

export interface ChromeState {
  route: RouteName;
  demo: boolean;
  budget: BudgetState;
  banner: Html | null; // the update banner, when there's a new version
}

// A cog for Settings: the usual sign for it
const COG = raw('<svg class="topbar__icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>');

const svg = (body: string) => raw(`<svg class="topbar__icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${body}</svg>`);
const LENS = svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>');
const CLOCK = svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>');

/**
 * href, name, the routes it's lit on, its icon, and whether at the top it's the icon alone (Settings: a cog leaves
 * the two words that matter more room). At the bottom (tabs.css) every tab is its icon over its word.
 */
const TABS: Array<[string, string, RouteName[], Html, boolean]> = [
  ["#/", "Search", ["home"], LENS, false],
  ["#/recent", "Recent", ["recent"], CLOCK, false],
  ["#/settings", "Settings", ["settings", "about"], COG, true],
];

export function chrome(s: ChromeState, main: Html): Html {
  return html`
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="topbar">
    <a class="topbar__logo" href="#/">LiveLine</a>
    <nav class="topbar__nav" aria-label="Main">
      ${TABS.map(([href, label, routes, icon, iconOnly]) => html`<a href="${href}" aria-current="${routes.includes(s.route) ? "page" : null}"${
        iconOnly ? html` class="topbar__cog" aria-label="${label}" title="${label}"` : ""}>${icon}<span class="topbar__word">${label}</span></a>`)}
    </nav>
  </header>
  ${s.demo ? html`<p class="banner banner--demo" role="note"><strong>Demo:</strong> simulated trains. <a href="#/settings">Add your key</a> for real ones.</p>` : ""}
  ${!s.demo && s.budget.remaining.hour <= 15 ? html`<p class="banner" role="note">Only ${s.budget.remaining.hour} Realtime Trains calls left this hour, so pages update less often.</p>` : ""}
  <div data-banner-slot>${s.banner ?? ""}</div>
  <p class="banner flash" data-flash role="status" aria-live="polite"></p>
  <main id="main" class="wrap" tabindex="-1">${main}</main>
  <footer class="footer wrap"><p>Data from <a href="https://www.realtimetrains.co.uk/" target="_blank" rel="noopener">Realtime Trains</a>${s.demo ? " (simulated)" : ""}. Not affiliated.</p></footer>`;
}
