// Appearance settings. Each sets an attribute on <html> that the CSS reads, so a change shows at once on every page.
// New appearance settings join this class.
import { KEYS } from "./keys";
import { Pref } from "./pref";

export const MARKER_STYLES = [["dot", "Dot"], ["bar", "Bar"], ["arrow", "Arrow"], ["front", "Train front"]] as const;
export type MarkerStyle = (typeof MARKER_STYLES)[number][0];

export class Appearance {
  private readonly markerPref = new Pref<string>(KEYS.marker, "dot");

  /** How the train is drawn on the route. Dot by default: easy to see on the line at any section length. */
  marker(): MarkerStyle {
    const v = this.markerPref.get();
    return MARKER_STYLES.some(([m]) => m === v) ? (v as MarkerStyle) : "dot";
  }

  setMarker(v: string): void {
    if (!MARKER_STYLES.some(([m]) => m === v)) return;
    this.markerPref.set(v);
    this.apply();
  }

  apply(): void {
    document.documentElement.dataset.marker = this.marker();
  }
}
