// A coach's facilities as small icons, with the name kept for screen readers and as a tooltip. RTT's names (wifi,
// toilet, first...) aren't a fixed list: one we have no icon for shows as its name. Stroke icons in the text colour.
import { type Html, html, raw } from "../html";

/** RTT's facility names, as people say them. */
export const FACILITY_NAMES: Record<string, string> = {
  first: "First class", toilet: "Toilet", wheelchair: "Wheelchair space", bicycle: "Bikes", quiet: "Quiet coach",
  buffet: "Buffet", wifi: "Wifi", power: "Sockets", usb: "USB", "baby-changing": "Baby changing",
  aircon: "Air conditioning", luggage: "Luggage space", sleeper: "Sleeper", entertainment: "Entertainment",
};
export const facilityName = (f: string) => FACILITY_NAMES[f] ?? f;

// 24×24, drawn with currentColor strokes
const ICONS: Record<string, string> = {
  first: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9.5 L13 7.5 V17"/>',
  toilet: '<path d="M7 3h6v7H7z"/><path d="M5 10h14c0 4-3 6-6 6h-1l1 5H8l1-5C7 15 5 13 5 10z"/>',
  wheelchair: '<circle cx="10" cy="4" r="1.6"/><path d="M10 7v6h6l2.5 5"/><path d="M10 10h5"/><path d="M8 11.2a5 5 0 1 0 6.5 6.3"/>',
  bicycle: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h2.5"/>',
  quiet: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  buffet: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5v2M11 3v2.5M14 3.5v2"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
  power: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
  usb: '<path d="M12 3v15M12 3l-2.5 3h5zM12 14l-4-3V8.5M12 12l4-2.5V7"/><circle cx="12" cy="19.5" r="1.6"/><rect x="6.5" y="7" width="3" height="2"/><circle cx="16" cy="6" r="1.3"/>',
  "baby-changing": '<path d="M9 3h6M10 3v3l-2 3v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V3"/><path d="M8 13h8"/>',
  aircon: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/>',
  luggage: '<rect x="5" y="7" width="14" height="12" rx="2"/><path d="M9 7V4h6v3M9 11v4M15 11v4M7.5 19v2M16.5 19v2"/>',
  sleeper: '<path d="M3 6v13M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="2"/>',
  entertainment: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 8.5v5l4.5-2.5z"/><path d="M8 20h8"/>',
};

/** One facility: its icon (or its name when we have no icon), named for screen readers. */
export function facilityIcon(f: string): Html {
  const name = facilityName(f);
  const icon = ICONS[f];
  if (!icon) return html`<span class="facility facility--text">${name}</span>`;
  return html`<span class="facility" title="${name}"><svg class="facility__icon" viewBox="0 0 24 24" width="20" height="20"
    aria-hidden="true" focusable="false">${raw(icon)}</svg><span class="visually-hidden">${name}</span></span>`;
}

/** A key to the icons used on this train, so you needn't guess what one means. */
export function facilityKey(used: string[]): Html {
  const known = used.filter((f) => ICONS[f]);
  return known.length ? html`<ul class="facility-key" aria-label="What the icons mean">${known.map((f) =>
    html`<li>${raw(`<svg class="facility__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">${ICONS[f]}</svg>`)}${facilityName(f)}</li>`)}</ul>` : html``;
}
