// Hash routes (they work from a file or inside the APK) and the board query they carry.
import { fromLondon, isoDate, londonParts, type Ms } from "../core/time";

export type RouteName = "home" | "board" | "train" | "recent" | "settings" | "about" | "unknown";

export interface Route {
  name: RouteName;
  path: string;
  params: URLSearchParams;
}

const NAMED: Record<string, RouteName> = { "/": "home", "/board": "board", "/recent": "recent", "/settings": "settings", "/about": "about" };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = h.split("?");
  const name = path.startsWith("/train/") ? "train" : NAMED[path] ?? "unknown";
  return { name, path, params: new URLSearchParams(query) };
}

/** What a board was asked for. Every field is a string straight from the hash. */
export interface Query {
  station?: string;
  to?: string;
  time?: string;
  day?: string;
  mode?: string;
  all?: string;
}

export const queryOf = (p: URLSearchParams): Query => ({
  station: p.get("station") ?? "", to: p.get("to") ?? "", time: p.get("time") ?? "", day: p.get("day") ?? "",
  mode: p.get("mode") ?? "dep", all: p.get("all") ?? "",
});

/** Query string for a hash route ("?a=1&b=2"), dropping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** "17:45" and a day (or today) to an instant. "00:30" typed late at night means tonight, not last night. */
export function when(time: string, day: string, now: Ms): Ms | null {
  const t = time.trim();
  const d = day.trim();
  if (!t && !d) return null;
  const date = d || isoDate(now);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError("bad day");
  const [y, mo, dd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!t) {
    const p = londonParts(now);
    return fromLondon(y, mo, dd, p.h, p.mi);
  }
  const tm = /^(\d{1,2})[:.](\d{2})$/.exec(t);
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) throw new RangeError("bad time");
  let at = fromLondon(y, mo, dd, Number(tm[1]), Number(tm[2]));
  if (!d && at < now - 6 * 3_600_000) at += 86_400_000;
  return at;
}

/** "09:00" and "2026-11-07" for a link to a board starting at `t`. */
export function timeParams(t: Ms): { time: string; day: string } {
  const p = londonParts(t);
  return { time: `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`, day: isoDate(t) };
}
