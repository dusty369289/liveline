// The Recent tab: every train you've opened, newest first.
import type { Ms } from "../../core/time";
import { ago, dayOrTime } from "../format";
import { type Html, html } from "../html";
import { type RecentTrain, RecentTrains } from "../store/recent-trains";

export function recentView(list: RecentTrain[], now: Ms): Html {
  const items = list.map((t) => {
    const running = RecentTrains.isRunning(t, now);
    const when = running ? "Running now" : t.ends ? `Finished ${dayOrTime(t.ends, now)}` : `Seen ${ago((now - t.seen) / 1000)}`;
    return html`<li class="recents__item${running ? " is-running" : ""}"><a class="recents__link" href="${t.href}">
      <span class="recents__title">${t.title}</span><span class="recents__when">${when}</span></a></li>`;
  });
  return html`
<div class="stack recents">
  <h1>Recent trains</h1>
  ${list.length
    ? html`<ol class="recents__list">${items}</ol>
      <p><button type="button" class="linkish" data-clear-recent>Clear this list</button></p>
      <p class="hint">Kept on this device only. The newest ${RecentTrains.MAX} trains you've opened.</p>`
    : html`<p class="empty">Trains you open show up here, newest first, so you can get back to them in one tap.</p>
      <p><a class="recents__search" href="#/">Search for a train</a></p>`}
</div>`;
}
