// About: what LiveLine shows, where the data comes from, the allowance, and what it can't show.
import type { BudgetState } from "../../core/budget";
import type { TokenInfo } from "../../core/rtt";
import { timeMark } from "../components/marks";
import { type Html, html } from "../html";

export interface AboutData {
  demo: boolean;
  info: TokenInfo | null;
  tokenError: string | null;
  budget: BudgetState;
  version: string;
}

function source(d: AboutData): Html {
  if (d.demo) {
    return html`<p class="banner banner--demo"><strong>Demo mode.</strong> No Realtime Trains key is set, so every train here is simulated on two real routes: Paddington to Oxford, and Waterloo to Woking.</p>
    <p>To see real trains:</p>
    <ol class="steps"><li>Sign in at <a href="https://api-portal.rtt.io" target="_blank" rel="noopener">api-portal.rtt.io</a> and request a key. The free plan is enough.</li>
      <li>Paste it in <a href="#/settings">Settings</a>. It stays on this device.</li></ol>`;
  }
  const i = d.info;
  return html`<dl class="facts">
    <dt>Key</dt><dd>${d.tokenError ? html`<span class="problem">${d.tokenError}</span>` : i ? `Working (${i.kind} token)` : "Not checked yet"}</dd>
    ${i ? html`<dt>API version</dt><dd>${i.apiVersion ?? "unknown"}</dd>
      <dt>Detailed mode</dt><dd>${i.entitlements.includes("allowDetailed") ? "On" : "Off (it comes with the paid plans)"}</dd>
      <dt>Entitlements</dt><dd>${i.entitlements.join(", ") || "none (free plan)"}</dd>` : ""}
  </dl>`;
}

export function aboutView(d: AboutData): Html {
  const b = d.budget;
  return html`
<div class="stack prose">
  <h1>About</h1>
  <p>LiveLine shows where your train is between stations. Realtime Trains records the time each train passes every timing point: stations, junctions and the stations it runs through. Between those reports, this app places the train on the line at the booked speed for that section.</p>
  <h2>Data source</h2>
  ${source(d)}
  <h2>Allowance</h2>
  <p>Realtime Trains limits how often your key can ask. Answers are kept for a minute (boards) or 30 seconds (trains), and calls go straight from this device to Realtime Trains.</p>
  <dl class="facts tnum">
    <dt>This minute</dt><dd>${b.remaining.minute} of ${b.limits.minute} left</dd>
    <dt>This hour</dt><dd>${b.remaining.hour} of ${b.limits.hour} left</dd>
    <dt>Today</dt><dd>${b.remaining.day} of ${b.limits.day} left</dd>
  </dl>
  <h2>Limits, plainly</h2>
  <ul class="bullets">
    <li>Signals and track circuits aren't in Realtime Trains' data, only timing points. Between two timing points, where the train is shown is our estimate.</li>
    <li>Reports are to the minute (to the quarter minute with detailed mode), so a train can be a little ahead of or behind where it's shown.</li>
    <li>A filled disc ${timeMark("actual")}means it happened, a ring ${timeMark("forecast")}is Realtime Trains’ forecast, and a dashed ring ${timeMark("est")}is our own guess. Everything except the dashed ring comes from Realtime Trains.</li>
  </ul>
  <p class="hint">Version ${d.version}. Source: <a href="https://github.com/dusty369289/liveline" target="_blank" rel="noopener">github.com/dusty369289/liveline</a> (MIT).
    Station list: <a href="https://github.com/davwheat/uk-railway-stations" target="_blank" rel="noopener">uk-railway-stations</a> (ODbL), from Trainline EU's data.
    Typeface: Barlow (SIL OFL).</p>
</div>`;
}
