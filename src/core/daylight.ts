// Where the sun is for a place and moment, so the Train view's sky follows the real clock rather than the app's
// theme. NOAA's low-precision solar equations: good to a minute or two in Great Britain, plenty for a sky colour.
import type { Ms } from "./time";

export type Sky = "dawn" | "day" | "dusk" | "night";

export const SKY = {
  centre: { lat: 52.5, lon: -1.5 }, // the middle of Great Britain, when we don't know where the train is
  rising: -0.833, // sun altitude (degrees) at sunrise and sunset: refraction and the sun's radius
  civil: -6, // civil twilight: before this it's night
  afterRise: 30 * 60_000, // dawn lasts this long past sunrise, while the light is still low and warm
  beforeSet: 30 * 60_000, // and dusk starts this long before sunset
};

const rad = Math.PI / 180;
const DAY = 86_400_000;

/** UTC moments the sun crosses `altitude` on `when`'s day, or null when it doesn't (never far enough in GB). */
function crossing(when: Ms, lat: number, lon: number, altitude: number): { rise: Ms; set: Ms } | null {
  const midnight = Math.floor(when / DAY) * DAY;
  const start = Date.UTC(new Date(midnight).getUTCFullYear(), 0, 1);
  const g = ((2 * Math.PI) / 365) * ((midnight - start) / DAY); // the year's angle, at noon
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = (Math.cos((90 - altitude) * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosHa < -1 || cosHa > 1) return null;
  const ha = Math.acos(cosHa) / rad; // degrees
  const noon = 720 - 4 * lon - eqTime; // solar noon, minutes after UTC midnight
  return { rise: midnight + (noon - 4 * ha) * 60_000, set: midnight + (noon + 4 * ha) * 60_000 };
}

export const sunTimes = (when: Ms, lat: number, lon: number) => crossing(when, lat, lon, SKY.rising);

/** The sky at `when`, where the train is (or the middle of GB). */
export function skyAt(when: Ms, lat = SKY.centre.lat, lon = SKY.centre.lon): Sky {
  const sun = sunTimes(when, lat, lon);
  const twilight = crossing(when, lat, lon, SKY.civil);
  if (!sun) return "day"; // the sun never sets (not seen in Great Britain, where it always does)
  const first = twilight?.rise ?? sun.rise - 3_600_000;
  const last = twilight?.set ?? sun.set + 3_600_000;
  if (when < first || when >= last) return "night";
  if (when < sun.rise + SKY.afterRise) return "dawn";
  if (when >= sun.set - SKY.beforeSet) return "dusk";
  return "day";
}
