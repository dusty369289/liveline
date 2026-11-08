// Appearance settings. Each sets an attribute on <html> that the CSS reads, so a change shows at once on every page.
// New appearance settings join this class.
import { KEYS } from "./keys";
import { Pref } from "./pref";

/** The themes in Settings, the default first. Each is public/css/themes/<id>.css; test/design.test.ts checks them all. */
export const THEMES = [
  ["operator", "Operator colour"],
  ["swiss", "Swiss timetable"],
  ["quiet", "Quiet"],
] as const;
export type Theme = (typeof THEMES)[number][0];

export const MARKER_STYLES = [["dot", "Dot"], ["bar", "Bar"], ["arrow", "Arrow"], ["front", "Train front"]] as const;
export type MarkerStyle = (typeof MARKER_STYLES)[number][0];

const known = <T extends string>(list: ReadonlyArray<readonly [T, string]>, v: unknown): v is T => list.some(([id]) => id === v);

export class Appearance {
  private readonly themePref = new Pref<string>(KEYS.theme, THEMES[0][0]);
  private readonly markerPref = new Pref<string>(KEYS.marker, "dot");

  /** How the whole app looks. Operator colour by default (the owner's choice); a value from elsewhere falls back. */
  theme(): Theme {
    const v = this.themePref.get();
    return known(THEMES, v) ? v : THEMES[0][0];
  }

  setTheme(v: string): void {
    if (!known(THEMES, v)) return;
    this.themePref.set(v);
    this.apply();
  }

  /** How the train is drawn on the route. Dot by default: easy to see on the line at any section length. */
  marker(): MarkerStyle {
    const v = this.markerPref.get();
    return known(MARKER_STYLES, v) ? v : "dot";
  }

  setMarker(v: string): void {
    if (!known(MARKER_STYLES, v)) return;
    this.markerPref.set(v);
    this.apply();
  }

  apply(): void {
    document.documentElement.dataset.theme = this.theme();
    document.documentElement.dataset.marker = this.marker();
  }
}
