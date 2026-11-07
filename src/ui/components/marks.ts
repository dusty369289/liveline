// The circle before a time, saying what kind of time it is, by shape rather than weight or colour:
// filled = it happened (reported), ring = Realtime Trains' forecast, dashed ring = our own guess.
// Drawn as tiny SVG so the dashed ring keeps four even dashes at 9 px (a CSS dashed border breaks up).
import type { Shown } from "../../core/engine";
import { type Html, html, raw } from "../html";

/** Every source a time can have (the engine's own type, so a new one can't slip past). */
export type TimeKind = Shown["source"];

/** The three looks: what happened, what Realtime Trains says (its forecast or its own estimate), our guess. */
export type MarkKind = "actual" | "forecast" | "est";
export const markOf = (k: TimeKind): MarkKind => (k === "actual" ? "actual" : k === "est" ? "est" : "forecast");

const CIRCLES: Record<MarkKind, string> = {
  actual: '<circle cx="5" cy="5" r="4.5" fill="currentColor"/>',
  forecast: '<circle cx="5" cy="5" r="3.8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  est: '<circle cx="5" cy="5" r="3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.98 3"/>',
};
const WORDS = { actual: "reported", forecast: "expected", est: "our estimate" } as const;

const svg = (circle: string) => raw(`<svg class="when-mark" viewBox="0 0 10 10" aria-hidden="true" focusable="false">${circle}</svg>`);

/** The mark plus the word for screen readers. */
export function timeMark(kind: TimeKind): Html {
  const k = markOf(kind);
  return html`${svg(CIRCLES[k])}<span class="visually-hidden">${WORDS[k]} </span>`;
}

/** A filled disc alone, for "this works" (the folded key line). */
export const doneMark = (): Html => svg(CIRCLES.actual);
