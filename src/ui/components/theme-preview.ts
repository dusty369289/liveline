// A miniature of a theme for Settings: a top bar, a nameboard, two departures and the big number, drawn with that
// theme's own tokens (data-theme on the miniature itself), so it can never drift from the real thing. It follows the
// phone's light or dark setting as the theme does. A picture: screen readers get the theme's name from its radio.
import { type Html, html } from "../html";
import type { Theme } from "../store/appearance";

export function themePreview(id: Theme): Html {
  return html`<span class="preview" data-theme="${id}" aria-hidden="true">
    <span class="preview__bar"><span class="preview__logo"></span><span class="preview__nav"></span></span>
    <span class="preview__board">Paddington</span>
    <span class="preview__row"><span class="preview__time">09:30</span><span class="preview__dest">Oxford</span><span class="preview__plat">3</span></span>
    <span class="preview__row"><span class="preview__time">09:42</span><span class="preview__dest">Reading</span><span class="preview__plat">4</span></span>
    <span class="preview__hero">42<span class="preview__unit">min</span></span>
    <span class="preview__button">Find trains</span>
  </span>`;
}
