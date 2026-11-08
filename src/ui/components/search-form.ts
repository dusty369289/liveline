// The search form, in the order people use it: a station, departures or arrivals, an optional second station
// ("Calling at" or "Coming from", following the mode), and only then, folded away, another time or day: most
// searches are "this station, now". Its station boxes are wired by StationSuggest; SearchForm handles the rest.
import { type Html, html, render } from "../html";
import { type Query, qs } from "../routes";

const stationBox = (id: string, label: Html, placeholder: string, value: string, extra: Html | "") => html`
  <div class="field">
    <label for="${id}" id="${id}-label" data-label-for="${id}">${label}</label>
    <div class="suggest" data-suggest>
      <input id="${id}" name="${id}" type="text" inputmode="search" placeholder="${placeholder}" value="${value}"
             role="combobox" aria-autocomplete="list" aria-controls="${id}-list" aria-expanded="false" ${extra}>
      <ul class="suggest__list" id="${id}-list" role="listbox" aria-labelledby="${id}-label" hidden></ul>
      <p class="visually-hidden" data-suggest-status="${id}" role="status" aria-live="polite"></p>
    </div>
  </div>`;

/** The second station's label, which follows Departures/Arrivals. */
const otherLabel = (arr: boolean) => html`${arr ? "Coming from" : "Calling at"} <span class="hint">(optional)</span>`;

export function searchForm(q: Query = {}): Html {
  const arr = q.mode === "arr";
  const later = !!(q.time || q.day);
  return html`
<form class="search stack" data-search role="search" autocomplete="off">
  ${stationBox("station", html`Station`, "e.g. Reading or RDG", q.station ?? "", html`required enterkeyhint="search"`)}
  <fieldset class="cluster mode">
    <legend class="visually-hidden">Show</legend>
    <label><input type="radio" name="mode" value="dep" ${!arr ? html`checked` : ""}> Departures</label>
    <label><input type="radio" name="mode" value="arr" ${arr ? html`checked` : ""}> Arrivals</label>
  </fieldset>
  ${stationBox("to", otherLabel(arr), "Any station", q.to ?? "", "")}
  <div class="search__go">
  <details class="search__when disclosure"${later ? html` open` : ""}>
    <summary>Another time or day</summary>
    <div class="cluster search__row">
      <div class="field field--time">
        <label for="time">Time</label>
        <input id="time" name="time" type="time" value="${q.time ?? ""}">
      </div>
      <div class="field field--day">
        <label for="day">Day</label>
        <input id="day" name="day" type="date" value="${q.day ?? ""}">
      </div>
    </div>
  </details>
  <button class="button" type="submit">Find trains</button>
  </div>
</form>`;
}

/** Submitting goes to the board the form describes; the second station's label follows the mode. */
export class SearchForm {
  static wire(root: ParentNode): void {
    const form = root.querySelector<HTMLFormElement>("[data-search]");
    if (!form) return;
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const get = (k: string) => String(f.get(k) ?? "");
      location.hash = `#/board${qs({ station: get("station"), to: get("to"), time: get("time"), day: get("day"), mode: get("mode") === "arr" ? "arr" : "" })}`;
    });
    const label = form.querySelector('[data-label-for="to"]');
    form.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
      if (label) render(label, otherLabel(r.value === "arr" && r.checked));
    }));
  }
}
