// Appearance settings, kept on this device. Each sets an attribute on <html> that the CSS reads, so a change shows
// at once on every page. More settings join this file as they're added.
import { prefs } from "./prefs";

const MARKER = "liveline.marker";
export const MARKER_STYLES = ["dot", "bar", "arrow", "front"] as const;
export type MarkerStyle = (typeof MARKER_STYLES)[number];

/** How the train is drawn on the route. Dot by default: easy to see on the line at any section length. */
export function markerStyle(): MarkerStyle {
  const v = prefs.get<string>(MARKER, "dot");
  return (MARKER_STYLES as readonly string[]).includes(v) ? (v as MarkerStyle) : "dot";
}

export function setMarkerStyle(v: string): void {
  if (!(MARKER_STYLES as readonly string[]).includes(v)) return;
  prefs.set(MARKER, v);
  applyAppearance();
}

export function applyAppearance(): void {
  document.documentElement.dataset.marker = markerStyle();
}
