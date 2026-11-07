// Time helpers. Every instant is epoch milliseconds (UTC). RTT gives UK local times without an offset, so we convert
// with the UK's own rule (BST from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October),
// instead of trusting each device's timezone data. Same answers on every phone, and in tests.

export type Ms = number;

const MIN = 60_000;

function lastSundayUtc(year: number, month: number): Ms {
  // month: 0-based. 01:00 UTC on the last Sunday of the month.
  const last = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0));
  return last.getTime() - last.getUTCDay() * 86_400_000;
}

/** Minutes the UK is ahead of UTC at this instant: 60 in summer, 0 in winter. */
export function londonOffset(t: Ms): number {
  const y = new Date(t).getUTCFullYear();
  return t >= lastSundayUtc(y, 2) && t < lastSundayUtc(y, 9) ? 60 : 0;
}

/** UK wall-clock time to an instant. For the hour that doesn't exist or happens twice, the earlier reading wins. */
export function fromLondon(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Ms {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = naive - londonOffset(naive - 60 * MIN) * MIN;
  return naive - londonOffset(first) * MIN;
}

export interface LondonParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  dow: number; // 0 = Sunday
}

export function londonParts(t: Ms): LondonParts {
  const x = new Date(t + londonOffset(t) * MIN);
  return {
    y: x.getUTCFullYear(),
    mo: x.getUTCMonth() + 1,
    d: x.getUTCDate(),
    h: x.getUTCHours(),
    mi: x.getUTCMinutes(),
    s: x.getUTCSeconds(),
    dow: x.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(t: Ms): string {
  const p = londonParts(t);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

/** "2026-11-07T14:20:00", UK local, no offset: how RTT writes times, and wants them back. */
export function isoLocal(t: Ms): string {
  const p = londonParts(t);
  return `${isoDate(t)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

/** Parse an ISO date-time. No offset means UK local time (as RTT sends). Returns null for anything else. */
export function parseTime(value: unknown): Ms | null {
  if (typeof value !== "string" || !value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  const nums = [y, mo, d, h, mi, s ?? "0"].map(Number);
  if (nums[1] < 1 || nums[1] > 12 || nums[2] < 1 || nums[2] > 31 || nums[3] > 23 || nums[4] > 59 || nums[5] > 59) {
    return null;
  }
  if (!tz) return fromLondon(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
  const base = Date.UTC(nums[0], nums[1] - 1, nums[2], nums[3], nums[4], nums[5]);
  if (tz === "Z") return base;
  const sign = tz[0] === "-" ? -1 : 1;
  const digits = tz.slice(1).replace(":", "");
  return base - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * MIN;
}

/** "2026-11-07" to the instant of local midnight. */
export function parseDate(value: string): Ms | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? fromLondon(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

export const FRACTIONS: Record<number, string> = { 15: "¼", 30: "½", 45: "¾" };

/** 14:31, or with `half`, 14:31½ / 14:31¼ (working timetable half minutes, detailed actuals quarters). */
export function hm(t: Ms | null | undefined, half = false): string {
  if (t == null) return "";
  const p = londonParts(t);
  let s = `${pad(p.h)}:${pad(p.mi)}`;
  if (half && p.s) s += FRACTIONS[Math.round(p.s / 15) * 15] ?? "";
  return s;
}

export function floorMinute(t: Ms): Ms {
  return Math.floor(t / MIN) * MIN;
}

export const minutes = (n: number): Ms => n * MIN;
export const seconds = (n: number): Ms => n * 1000;
