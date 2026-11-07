// Around every page: the top bar, the banners (demo, allowance, a new version), main, and the footer.
import type { BudgetState } from "../../core/budget";
import { type Html, html } from "../html";
import type { RouteName } from "../routes";

export interface ChromeState {
  route: RouteName;
  demo: boolean;
  budget: BudgetState;
  banner: Html | null; // the update banner, when there's a new version
}

const TABS: Array<[string, string, RouteName[]]> = [
  ["#/", "Search", ["home"]],
  ["#/recent", "Recent", ["recent"]],
  ["#/settings", "Settings", ["settings", "about"]],
];

export function chrome(s: ChromeState, main: Html): Html {
  return html`
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="topbar">
    <a class="topbar__logo" href="#/">LiveLine</a>
    <nav class="topbar__nav" aria-label="Main">
      ${TABS.map(([href, label, routes]) => html`<a href="${href}" aria-current="${routes.includes(s.route) ? "page" : null}">${label}</a>`)}
    </nav>
  </header>
  ${s.demo ? html`<p class="banner banner--demo" role="note"><strong>Demo data.</strong> These trains are simulated. Add your Realtime Trains key in <a href="#/settings">Settings</a> to see real ones.</p>` : ""}
  ${!s.demo && s.budget.remaining.hour <= 15 ? html`<p class="banner" role="note">Only ${s.budget.remaining.hour} Realtime Trains calls left this hour, so pages update less often.</p>` : ""}
  ${s.banner ?? ""}
  <main id="main" class="wrap">${main}</main>
  <footer class="footer wrap"><p>Data from <a href="https://www.realtimetrains.co.uk/" target="_blank" rel="noopener">Realtime Trains</a>${s.demo ? " (simulated)" : ""}. Not affiliated.</p></footer>`;
}
