// The search form: station, time, day, "calling at", departures or arrivals. Its two station boxes are wired by
// StationSuggest (widgets/station-suggest.ts) and submitting it is handled by SearchForm.
import { type Html, html } from "../html";
import { type Query, qs } from "../routes";

const stationBox = (id: string, label: Html, placeholder: string, value: string, extra: Html | "") => html`
  <div class="field">
    <label for="${id}">${label}</label>
    <div class="suggest" data-suggest>
      <input id="${id}" name="${id}" type="text" inputmode="search" placeholder="${placeholder}" value="${value}"
             aria-autocomplete="list" aria-controls="${id}-list" aria-expanded="false" ${extra}>
      <ul class="suggest__list" id="${id}-list" role="listbox" hidden></ul>
    </div>
  </div>`;

export function searchForm(q: Query = {}): Html {
  return html`
<form class="search stack" data-search role="search" autocomplete="off">
  ${stationBox("station", html`Station`, "e.g. Reading or RDG", q.station ?? "", html`required enterkeyhint="search"`)}
  <div class="cluster search__row">
    <div class="field field--time">
      <label for="time">Time</label>
      <input id="time" name="time" type="time" value="${q.time ?? ""}" aria-describedby="time-hint">
    </div>
    <div class="field field--day">
      <label for="day">Day</label>
      <input id="day" name="day" type="date" value="${q.day ?? ""}">
    </div>
  </div>
  <p class="hint" id="time-hint">Leave time empty for trains leaving now.</p>
  ${stationBox("to", html`Calling at <span class="hint">(optional; for arrivals, coming from)</span>`, "Any station", q.to ?? "", "")}
  <fieldset class="cluster mode">
    <legend class="visually-hidden">Show</legend>
    <label><input type="radio" name="mode" value="dep" ${q.mode !== "arr" ? html`checked` : ""}> Departures</label>
    <label><input type="radio" name="mode" value="arr" ${q.mode === "arr" ? html`checked` : ""}> Arrivals</label>
  </fieldset>
  <button class="button" type="submit">Find trains</button>
</form>`;
}

/** Submitting the form goes to the board it describes. */
export class SearchForm {
  static wire(root: ParentNode): void {
    const form = root.querySelector<HTMLFormElement>("[data-search]");
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const get = (k: string) => String(f.get(k) ?? "");
      location.hash = `#/board${qs({ station: get("station"), to: get("to"), time: get("time"), day: get("day"), mode: get("mode") === "arr" ? "arr" : "" })}`;
    });
  }
}
