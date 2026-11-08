// The Saved journeys page: each journey you starred on a board, opening that board, with a bin to remove it.
import { BIN_ICON } from "../components/icons";
import { type Html, html } from "../html";
import { boardHash } from "../routes";
import type { Journey } from "../store/lists";

export function journeysView(list: Journey[]): Html {
  const items = list.map((j) => html`
    <li class="journeys__item">
      <a class="journeys__go" href="${boardHash({ station: j.from, to: j.to })}">${j.fromName} → ${j.toName}</a>
      <button type="button" class="journeys__remove" data-remove-journey="${j.from} ${j.to}"
        aria-label="Remove ${j.fromName} to ${j.toName}" title="Remove">${BIN_ICON}</button>
    </li>`);
  return html`
<div class="stack journeys">
  <h1>Saved journeys</h1>
  ${list.length
    ? html`<ul class="journeys__list">${items}</ul>
      <p class="hint">Kept on this device only. Star a board with a “Calling at” station to add one.</p>`
    : html`<p class="empty">Put a station in “Calling at”, then star the board: the journey is kept here.</p>
      <p><a class="journeys__search" href="#/">Search for a train</a></p>`}
</div>`;
}
