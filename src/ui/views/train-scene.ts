// The Train view tab: the scene (scenery, platform, the train you can scroll along), the coaches' letters and
// facilities when RTT sends them, and along the bottom the station it left and the one it's due at next.
// train-scene.ts (in ui/) moves it; these are the pieces it draws and redraws.
import type { Formation } from "../../core/formation";
import type { Scene, SceneEnd } from "../../core/scene";
import { hm } from "../../core/time";
import { facilityIcon, facilityKey, facilityName } from "../components/facilities";
import { markOf, timeMark } from "../components/marks";
import { delayClass, lateness } from "../format";
import { type Html, html } from "../html";
import { backdrop, foreground, SCENE_H } from "./scene-art";
import { trainSvg } from "./train-art";

/** The coaches' names under the train, front first (drawn right to left, as the train faces), with facility icons. */
export function coachList(f: Formation): Html {
  return html`<ol class="coaches" aria-label="Coaches, front first">${f.coaches.map((c, i) => html`
    <li class="coaches__item"><b class="coaches__name">${c.letter ? `Coach ${c.letter}` : `Coach ${i + 1}`}</b>${
      !c.letter && i === 0 ? html` <span class="coaches__what">front</span>` : ""}${
      c.facilities.length ? html`<span class="coaches__icons">${c.facilities.map(facilityIcon)}</span>` : ""}</li>`)}</ol>`;
}

/** What we know about the coaches, and plainly what we don't; a key to the icons used. */
export function formationNote(f: Formation): Html {
  const all = f.facilities.length ? `Throughout: ${f.facilities.map(facilityName).join(", ")}. ` : "";
  const used = [...new Set(f.coaches.flatMap((c) => c.facilities))];
  if (f.detailed) return html`${facilityKey(used)}${all}Coach letters and facilities from Realtime Trains.`;
  const count = f.countKnown ? "" : " Realtime Trains doesn't say how many coaches, so four are drawn.";
  return html`${all}Coaches are numbered from the front. Realtime Trains doesn't send coach letters or facilities for this train.${count}`;
}

function end(e: SceneEnd | null, cls: string): Html {
  if (!e) return html`<div class="scene__end ${cls}"></div>`;
  const s = e.shown;
  return html`<div class="scene__end ${cls}">
    <span class="scene__where">${e.label}</span>
    ${s?.time != null ? html`<span class="scene__time tnum ${delayClass(s)} src-${s.source === "booked" ? "booked" : markOf(s.source)}">${
      s.source === "booked" ? "" : timeMark(s.source)}${hm(s.time)}</span>` : ""}
    <span class="scene__late ${delayClass(s)}">${lateness(s)}</span>
  </div>`;
}

/** The two ends along the bottom, with the train's dot between them. */
export function sceneEnds(sc: Scene): Html {
  return html`<div class="scene__ends">
    ${end(sc.left, "scene__end--from")}
    ${sc.right ? html`<div class="scene__line" aria-hidden="true"><span class="scene__dot" data-dot></span></div>` : html`<span></span>`}
    ${end(sc.right, "scene__end--to")}
  </div>`;
}

/** px of drawing to the right of the platform's end (its ramp): train-scene.ts lines the end up with the nose. */
export const PLATFORM_END = 24;

/** The platform as its own SVG, `length` + PLATFORM_END wide, its end at x = length. */
export function platformSvg(name: string, number: string | null, length: number): Html {
  return html`<svg width="${length + PLATFORM_END}" height="${SCENE_H}" aria-hidden="true" focusable="false">
    <defs><pattern id="sc-valance" width="16" height="8" patternUnits="userSpaceOnUse"><path class="sc-valance" d="M0 0 L8 8 L16 0 Z"/></pattern></defs>
    <g transform="translate(${length} 0)">${platformArt(name, number, length)}</g></svg>`;
}

/** The platform the train stands at or is pulling into: wall, canopy, signs, the yellow line. x runs to 0 at its end. */
function platformArt(name: string, number: string | null, length: number): Html {
  const signW = Math.round(18 + name.length * 8.4);
  // The first sign just behind the nose, where you're looking when it stops; more every 460 px towards the back
  const signs = Array.from({ length: Math.max(1, Math.floor(length / 460)) }, (_, i) => -(signW + 110) - i * 460);
  const columns = Array.from({ length: Math.floor(length / 150) }, (_, i) => -length + 40 + i * 150);
  return html`
    <rect class="sc-wall" x="${-length}" y="176" width="${length}" height="64"/>
    ${[188, 200, 212, 224].map((y) => html`<rect class="sc-wall-line" x="${-length}" y="${y}" width="${length}" height="1.5"/>`)}
    <rect class="sc-canopy" x="${-length}" y="150" width="${length}" height="12"/>
    <rect class="sc-valance-row" x="${-length}" y="162" width="${length}" height="8"/>
    ${columns.map((x) => html`<rect class="sc-canopy" x="${x}" y="162" width="5" height="78"/>`)}
    ${signs.map((x, i) => html`<g>
      <rect class="sc-sign" x="${x}" y="176" width="${signW}" height="24" rx="3"/>
      <text class="sc-sign-ink" x="${x + signW / 2}" y="193" text-anchor="middle">${name}</text>
      ${number && i === 0 ? html`<rect class="sc-sign" x="${x + signW + 12}" y="176" width="${Math.max(24, 12 + number.length * 9)}" height="24" rx="3"/>
        <text class="sc-sign-ink" x="${x + signW + 12 + Math.max(24, 12 + number.length * 9) / 2}" y="193" text-anchor="middle">${number}</text>` : ""}
    </g>`)}
    <rect class="sc-platform" x="${-length}" y="238" width="${length}" height="14"/>
    <path class="sc-platform" d="M0 238 L18 252 L0 252 Z"/>
    <rect class="sc-edge" x="${-length}" y="246" width="${length}" height="3"/>`;
}

export function scenePanel(sc: Scene, f: Formation, headline: string, sky: string, shown: boolean): Html {
  return html`
<section class="scene-panel stack" data-scene-panel id="panel-scene" role="tabpanel" aria-labelledby="tab-scene" ${shown ? "" : html`hidden`}>
  <div class="scene" data-scene data-sky="${sky}" data-phase="${sc.phase}">
    <div class="scene__art" aria-hidden="true">
      ${backdrop}
      <div class="scene__platform is-gone" data-platform></div>
      ${foreground}
    </div>
    <div class="scene__scroller" data-scroller tabindex="0" aria-label="The train. Scroll sideways to see every coach.">
      <div class="scene__content" data-content>${trainSvg(f)}<div class="scene__coaches" data-coaches>${coachList(f)}</div></div>
    </div>
  </div>
  <div class="scene__map" aria-hidden="true"><span class="scene__map-bar" data-map></span><span class="scene__map-text" data-map-text></span></div>
  <div data-ends>${sceneEnds(sc)}</div>
  <p class="scene__headline" data-headline role="status">${headline}</p>
  <div class="hint stack scene__note" data-formation-note>${formationNote(f)}</div>
</section>`;
}
