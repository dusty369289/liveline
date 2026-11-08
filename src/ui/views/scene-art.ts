// The Train view's scenery: fixed SVG, one tile per layer, each layer drawn three tiles wide and slid by
// train-scene.ts at its own rate (far hills slow, the track at the train's speed). Shapes only, with classes: every
// colour is a token in themes/scene.css, which changes with the sky (dawn, day, dusk, night) and the theme.
import { type Html, html, raw } from "../html";

export const TILE = 480; // px: one repeat of every layer; three cover the widest phone in landscape
export const SCENE_H = 300; // px: the scene's height; the track's rail is at RAIL_Y
export const RAIL_Y = 253;

/** Each layer and how fast it moves against the track (1 = with the train's wheels). */
export const LAYERS = { stars: 0.01, clouds: 0.03, far: 0.08, mid: 0.25, near: 0.6, track: 1, fore: 1.4 } as const;
export type Layer = keyof typeof LAYERS;

const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join("");

const TILES: Record<Layer, string> = {
  stars: `<g class="sc-stars">${[[20, 30, 1], [64, 18, 1.3], [110, 44, 0.9], [150, 22, 1.1], [196, 60, 0.8], [232, 28, 1.2],
    [270, 66, 0.9], [298, 16, 1], [350, 50, 0.9], [380, 36, 1.1], [430, 22, 1], [458, 70, 0.8], [44, 84, 0.8], [128, 92, 0.9]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`,
  clouds: `<g class="sc-cloud"><circle cx="60" cy="58" r="13"/><circle cx="76" cy="52" r="17"/><circle cx="94" cy="58" r="12"/>
    <rect x="48" y="58" width="58" height="12" rx="6"/><circle cx="300" cy="38" r="9"/><circle cx="312" cy="33" r="12"/>
    <circle cx="325" cy="38" r="8"/><rect x="291" y="38" width="42" height="9" rx="4.5"/></g>`,
  far: `<path class="sc-far" d="M0 150 C50 128 96 124 140 136 C186 148 220 120 280 118 C340 116 372 142 420 140 C448 139 466 146 480 150 L480 300 L0 300 Z"/>`,
  mid: `<path class="sc-mid" d="M0 186 C60 170 104 168 160 178 C216 188 262 164 330 166 C392 168 440 184 480 186 L480 300 L0 300 Z"/>
    <g class="sc-tree"><circle cx="58" cy="166" r="11"/><circle cx="76" cy="170" r="8"/><circle cx="244" cy="160" r="12"/><circle cx="430" cy="168" r="10"/></g>
    <g class="sc-trunk"><rect x="57" y="174" width="2.5" height="10"/><rect x="75" y="176" width="2" height="8"/><rect x="243" y="169" width="2.5" height="10"/><rect x="429" y="175" width="2.5" height="9"/></g>
    <g><rect class="sc-house" x="318" y="164" width="26" height="15"/><path class="sc-roof" d="M314 165 L331 153 L348 165 Z"/>
    <rect class="sc-house-window" x="323" y="168" width="5" height="5"/><rect class="sc-house-window" x="334" y="168" width="5" height="5"/></g>
    <ellipse class="sc-sheep" cx="150" cy="181" rx="7" ry="4.5"/><circle class="sc-sheep-face" cx="157" cy="179" r="2.6"/>
    <ellipse class="sc-sheep" cx="176" cy="183" rx="6" ry="4"/><circle class="sc-sheep-face" cx="170" cy="181" r="2.4"/>`,
  near: `<g class="sc-fence"><rect x="0" y="222" width="480" height="2"/><rect x="0" y="229" width="480" height="2"/>
    ${range(8, (i) => `<rect x="${10 + i * 60}" y="216" width="3" height="20"/>`)}</g>
    <g class="sc-hedge"><ellipse cx="40" cy="233" rx="20" ry="10"/><ellipse cx="226" cy="234" rx="26" ry="11"/><ellipse cx="390" cy="233" rx="18" ry="9"/></g>`,
  track: `<rect class="sc-ballast" x="0" y="258" width="480" height="16"/>
    <g class="sc-sleeper">${range(20, (i) => `<rect x="${2 + i * 24}" y="256" width="9" height="5"/>`)}</g>
    <rect class="sc-rail" x="0" y="${RAIL_Y}" width="480" height="3"/>`,
  fore: `<rect class="sc-fore" x="0" y="274" width="480" height="26"/>
    <g class="sc-tuft"><path d="M30 286 l4 -9 l4 9 Z"/><path d="M170 290 l5 -10 l5 10 Z"/><path d="M300 284 l4 -8 l4 8 Z"/><path d="M432 289 l5 -10 l5 10 Z"/></g>`,
};

// Each layer is its own SVG, slid with a CSS transform: the GPU moves it without repainting, which is what keeps
// the animation cheap on a phone (an SVG attribute change would repaint the whole scene every frame).
const layer = (name: Layer) => raw(`<svg class="scene__layer" data-layer="${name}" width="${3 * TILE}" height="${SCENE_H}" aria-hidden="true" focusable="false">${
  range(3, (i) => `<g transform="translate(${i * TILE} 0)">${TILES[name]}</g>`)}</svg>`);

/** The sky (still), then everything behind the platform. */
export const backdrop: Html = html`
  <svg class="scene__sky" width="100%" height="${SCENE_H}" aria-hidden="true" focusable="false">
    <rect class="sc-sky" width="100%" height="${SCENE_H}"/>
    <rect class="sc-low" y="96" width="100%" height="80"/>
    <g class="scene__sun" transform="translate(300 56)"><circle class="sc-sun" cx="0" cy="0" r="19"/><circle class="sc-moon-cut" cx="8" cy="-6" r="16"/></g>
  </svg>
  ${layer("stars")}${layer("clouds")}${layer("far")}${layer("mid")}${layer("near")}`;

/** In front of the platform: the track and the grass below it. */
export const foreground: Html = html`${layer("track")}${layer("fore")}`;
