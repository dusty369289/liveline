// Settings: the key (folded to one line once it works), appearance, updates and what each plan gives you.
import type { BudgetState } from "../../core/budget";
import { precision, type Tier, TIERS } from "../../core/rail";
import type { TokenInfo } from "../../core/rtt";
import { doneMark } from "../components/marks";
import { type Html, html } from "../html";
import { MARKER_STYLES, type MarkerStyle } from "../store/appearance";
import type { UpdateInfo } from "../updates";

export interface SettingsData {
  demo: boolean;
  tier: Tier;
  info: TokenInfo | null;
  hint: string | null; // the key's last characters
  tokenError: string | null;
  budget: BudgetState;
  message: string | null; // after saving or forgetting the key
  error: string | null;
  update: UpdateInfo;
  native: boolean; // on the phone (key in private storage) or a browser
  selfUpdate: boolean; // can install its own updates (Android)
  marker: MarkerStyle;
}

function keyForm(d: SettingsData): Html {
  const where = d.native ? "phone" : "device";
  return html`
    <form class="stack" data-key-form autocomplete="off">
      <div class="field">
        <label for="token">${d.demo ? "Paste your key" : "Replace key"}</label>
        <input id="token" name="token" type="password" required minlength="20" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="eyJ…">
      </div>
      <p class="hint">It's checked with Realtime Trains first (1 to 3 calls), then kept <strong>only on this ${where}</strong>${
        d.native ? ", in the app's private storage" : ""}. The app talks to Realtime Trains directly, so your key never goes anywhere else.</p>
      <button class="button" type="submit">Check and save key</button>
    </form>
    ${d.demo ? "" : html`<p><button class="linkish" type="button" data-forget-key>Forget my key on this ${where}</button></p>`}`;
}

/** No key: the form, open. A working key: one line that opens to manage it. A problem: open, saying so. */
function keySection(d: SettingsData): Html {
  if (d.demo) {
    return html`<section class="stack" aria-labelledby="key-h">
    <h2 id="key-h">Realtime Trains key</h2>
    <p>No key yet, so the trains you see are <strong>simulated</strong>. Get a free key at
      <a href="https://api-portal.rtt.io" target="_blank" rel="noopener">api-portal.rtt.io</a>, then paste it here.</p>
    ${keyForm(d)}
  </section>`;
  }
  const open = !!(d.tokenError || d.error);
  return html`<section aria-labelledby="key-h"><details class="keybox" ${open ? html`open` : ""}>
    <summary class="keybox__summary"><span class="keybox__text"><h2 id="key-h" class="keybox__title">Realtime Trains key</h2>
      <span class="keybox__line">${d.tokenError ? html`<span class="problem">Needs attention</span>`
        : html`${doneMark()}<strong>${d.tier.name}</strong> · <span class="tnum">${d.hint ?? "set"}</span>`}</span></span>
      <span class="keybox__manage">Manage</span></summary>
    <div class="stack keybox__body">
      <dl class="facts">
        <dt>Plan</dt><dd><strong>${d.tier.name}</strong></dd>
        <dt>Key</dt><dd class="tnum">${d.hint ?? "set"}${d.info ? ` (${d.info.kind} token)` : ""}</dd>
        ${d.tokenError ? html`<dt>Problem</dt><dd class="problem">${d.tokenError}</dd>` : ""}
        <dt>Times</dt><dd>Reported ${precision(d.tier)}</dd>
        <dt>Allowance</dt><dd class="tnum">${d.budget.remaining.minute} of ${d.tier.perMinute} left this minute, ${d.budget.remaining.hour} of ${d.tier.perHour} this hour</dd>
        ${d.info?.historyDays ? html`<dt>History</dt><dd>Trains from the last ${d.info.historyDays} days</dd>` : ""}
      </dl>
      ${keyForm(d)}
    </div></details></section>`;
}

function appearanceSection(d: SettingsData): Html {
  return html`<section class="stack" aria-labelledby="look-h">
    <h2 id="look-h">Appearance</h2>
    <fieldset class="markers">
      <legend>The train on the route</legend>
      ${MARKER_STYLES.map(([value, label]) => html`<label class="markers__opt">
        <input type="radio" name="marker" value="${value}" data-marker-choice ${d.marker === value ? html`checked` : ""}>
        <span class="markers__demo" aria-hidden="true"><span class="route__train" data-m="${value}"></span></span>
        <span>${label}</span></label>`)}
    </fieldset>
  </section>`;
}

function updateBody(u: UpdateInfo, selfUpdate: boolean): Html {
  if (u.state === "available") {
    return html`<p><strong>Version ${u.latest} is available</strong> (you have ${u.current}).</p>
      ${u.notes ? html`<p class="hint">${u.notes}</p>` : ""}
      ${selfUpdate && u.apk
        ? html`<p><button class="button" type="button" data-install-update ${u.progress ? html`disabled` : ""}>Update to ${u.latest}</button></p>
          <p class="hint" data-update-progress role="status" aria-live="polite">${u.progress ?? ""}</p>
          ${u.message ? html`<p class="problem">${u.message}</p>` : ""}
          <p class="hint">Installs over this version. Your key, journeys and settings stay. Android checks it's signed by the same
            developer, and asks you once to allow LiveLine to install updates.</p>`
        : html`<p><a class="button" href="${u.url ?? u.page}" target="_blank" rel="noopener" data-download>Download ${u.latest}</a></p>
          <p class="hint">Android asks to install it over this version. Your key and journeys stay.</p>`}`;
  }
  if (u.state === "current") return html`<p>${u.message ? `${u.message} You have ${u.current}.` : `You have the latest version (${u.current}).`}</p>`;
  if (u.state === "checking") return html`<p>Checking…</p>`;
  if (u.state === "error") return html`<p class="problem">${u.message}</p>`;
  return html`<p>Version ${u.current}.</p>`;
}

function tiersSection(tier: Tier): Html {
  const isCurrent = (name: string) => tier.name === name || (name === "Team" && tier.name === "Team or above");
  return html`<section class="stack" aria-labelledby="tier-h">
    <h2 id="tier-h">What each plan gives you here</h2>
    <table class="tiers">
      <thead><tr><th scope="col">Plan</th><th scope="col">In this app</th><th scope="col">Cost</th></tr></thead>
      <tbody>${TIERS.map(([name, what, cost]) => html`
        <tr class="${isCurrent(name) ? "is-current" : null}" aria-current="${isCurrent(name) ? "true" : null}">
          <th scope="row">${name}${isCurrent(name) ? html` <span class="hint">(yours)</span>` : ""}</th><td>${what}</td><td class="tnum">${cost}</td>
        </tr>`)}</tbody>
    </table>
    <p class="hint">The app switches features on from what your key is actually allowed, as Realtime Trains reports it.
      A higher plan's bigger allowance means trains refresh more often, worked out from the limits each answer reports.</p>
  </section>`;
}

export function settingsView(d: SettingsData): Html {
  return html`
<div class="stack prose settings">
  <h1>Settings</h1>
  ${d.message ? html`<p class="banner" role="status">${d.message}</p>` : ""}
  ${d.error ? html`<p class="problem" role="alert">${d.error}</p>` : ""}
  ${keySection(d)}
  ${appearanceSection(d)}
  <section class="stack" aria-labelledby="update-h">
    <h2 id="update-h">Updates</h2>
    <div data-update-body>${updateBody(d.update, d.selfUpdate)}</div>
    <p><button class="linkish" type="button" data-check-update>Check for updates</button></p>
    <p class="hint">Asks GitHub for the latest release of LiveLine. Nothing else is sent.</p>
  </section>
  ${tiersSection(d.tier)}
  <p class="settings__about"><a href="#/about">About LiveLine: the data, the allowance and what it can't show</a></p>
</div>`;
}
