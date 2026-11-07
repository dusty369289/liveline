// The Train view's train, drawn from its formation: coaches front first (front at the right, as it travels right),
// a sloped yellow nose at the front, flat yellow cab ends where one unit meets the next and at the back, and the
// yellow stripe over first-class windows, as on the real thing. Classes only: colours are in themes/scene.css.
import type { Coach, Formation } from "../../core/formation";
import { escape, type Html, html, raw } from "../html";

export const COACH = { w: 150, gap: 6, nose: 26, top: 200, h: 48, wheelY: 251 } as const;

/** The train's drawn width, nose included. */
export const trainWidth = (n: number) => COACH.nose + n * COACH.w + Math.max(n - 1, 0) * COACH.gap;

/** Where coach `i` (0 = front) starts, from the left of the drawing. */
export const coachLeft = (n: number, i: number) => trainWidth(n) - COACH.nose - (i + 1) * COACH.w - i * COACH.gap;

const WINDOWS = [10, 36, 82, 108]; // window positions along a coach, with a door between the pairs
const WHEELS = [14, 28, 122, 136]; // two bogies of two wheels

function coachSvg(c: Coach, i: number, all: Coach[]): string {
  const n = all.length;
  const x = coachLeft(n, i);
  const { top, h, w } = COACH;
  const front = i === 0;
  const cabAhead = !front && all[i - 1].unit !== c.unit; // the coach ahead is another unit: this end is a cab
  const cabBehind = i === n - 1 || all[i + 1].unit !== c.unit;
  const parts: string[] = [];
  if (front) {
    const r = x + w;
    parts.push(`<path class="sc-coach" d="M${x} ${top} H${r} C${r + 14} ${top} ${r + 24} ${top + 14} ${r + 26} ${top + 30} V${top + h} H${x} Z"/>`,
      `<path class="sc-front" d="M${r + 2} ${top} C${r + 14} ${top} ${r + 24} ${top + 14} ${r + 26} ${top + 30} V${top + h} H${r + 4} Z"/>`,
      `<path class="sc-screen" d="M${r + 4} ${top + 4} C${r + 12} ${top + 6} ${r + 18} ${top + 14} ${r + 20} ${top + 22} H${r + 6} Z"/>`,
      `<circle class="sc-lamp" cx="${r + 20}" cy="${top + 40}" r="2.6"/>`);
  } else {
    parts.push(`<rect class="sc-coach" x="${x}" y="${top}" width="${w}" height="${h}" rx="5"/>`);
    if (cabAhead) parts.push(`<rect class="sc-front" x="${x + w - 8}" y="${top}" width="8" height="${h}" rx="3"/>`);
  }
  if (cabBehind) parts.push(`<rect class="sc-front" x="${x}" y="${top}" width="8" height="${h}" rx="3"/>`,
    i === n - 1 ? `<circle class="sc-tail" cx="${x + 4}" cy="${top + 40}" r="2"/>` : "");
  if (c.passenger) {
    parts.push(...WINDOWS.filter((o) => !(front && o > 100)).map((o) =>
      `<rect class="sc-coach-window" x="${x + o}" y="${top + 9}" width="20" height="14" rx="2"/>`));
    parts.push(`<rect class="sc-door" x="${x + 64}" y="${top + 6}" width="12" height="${h - 10}" rx="1.5"/>`);
    if (c.facilities.includes("first")) parts.push(`<rect class="sc-stripe" x="${x + 10}" y="${top + 4}" width="${front ? 110 : w - 20}" height="2"/>`);
  } else {
    parts.push(`<g class="sc-door">${[20, 40, 60, 80, 100].map((o) => `<rect x="${x + o}" y="${top + 10}" width="10" height="3"/>`).join("")}</g>`);
  }
  if (c.letter) {
    parts.push(`<rect class="sc-plate" x="${x + w - 26}" y="${top + 28}" width="15" height="13" rx="2"/>`,
      `<text class="sc-plate-ink" x="${x + w - 18.5}" y="${top + 38.5}" text-anchor="middle">${escape(c.letter.slice(0, 2))}</text>`); // RTT's text: escaped
  }
  if (i < n - 1) parts.push(`<rect class="sc-gangway" x="${x - COACH.gap}" y="${top + 8}" width="${COACH.gap}" height="${h - 14}"/>`);
  return parts.join("");
}

/** The whole train as one SVG, wheels in their own groups so they can turn. */
export function trainSvg(f: Formation): Html {
  const n = f.coaches.length;
  const width = trainWidth(n);
  const wheels = f.coaches.flatMap((_, i) => WHEELS.map((o) => {
    const cx = coachLeft(n, i) + o;
    return `<g class="sc-wheel"><circle cx="${cx}" cy="${COACH.wheelY}" r="6"/><rect class="sc-spoke" x="${cx - 1}" y="${COACH.wheelY - 5}" width="2" height="10"/></g>`;
  })).join("");
  return html`<svg class="scene__train" width="${width}" height="300" viewBox="0 0 ${width} 300" aria-hidden="true" focusable="false">
    <g class="scene__body">${raw(f.coaches.map((c, i, all) => coachSvg(c, i, all)).join(""))}</g>${raw(wheels)}</svg>`;
}
