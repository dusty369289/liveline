// One allowance for every real RTT call: obeys RTT's rate-limit headers, and is careful before it has seen any.
// Free and Hobbyist: 10 a minute, 100 an hour, 1000 a day.
// Searches (interactive) may use the last `reserve` calls of the hour; background refreshes may not.
import type { Ms } from "./time";

export const DIMENSIONS = { minute: 60, hour: 3600, day: 86400, week: 604800 } as const;
export type Dim = keyof typeof DIMENSIONS;
const DIMS = Object.keys(DIMENSIONS) as Dim[];
export const FREE_LIMITS: Record<Dim, number> = { minute: 10, hour: 100, day: 1000, week: 7000 };

export interface BudgetState {
  limits: Record<Dim, number>;
  remaining: Record<Dim, number>;
  blockedUntil: Ms | null;
  callsMade: number;
}

export class Budget {
  limits: Record<Dim, number> = { ...FREE_LIMITS };
  blockedUntil: Ms | null = null;
  total = 0;
  private calls: Ms[] = [];
  private headerRemaining = new Map<Dim, [number, Ms]>();

  constructor(
    private clock: () => Ms = Date.now,
    public reserve = 10,
    private unlimited = false,
  ) {
    if (unlimited) this.limits = { minute: 1e9, hour: 1e9, day: 1e9, week: 1e9 };
  }

  /** For the simulator: it costs nothing, so demo mode can't be used up. */
  static unlimited(clock: () => Ms = Date.now): Budget {
    return new Budget(clock, 0, true);
  }

  /** Calls in the last `secs` seconds. One exactly that old has just left, so freeAt can name an exact moment. */
  private used(now: Ms, secs: number): number {
    const cutoff = now - secs * 1000;
    return this.calls.filter((t) => t > cutoff).length;
  }

  /** How many free calls in this window a kind of call needs: background ones leave the reserve for searches. */
  private need(dim: Dim, interactive: boolean): number {
    return interactive || dim === "minute" || dim === "week" ? 1 : 1 + this.reserve;
  }

  /**
   * When `need` calls in this window are free again, if nothing more is spent: our own count frees up as its oldest
   * calls leave the window, a header's count when its window is over. Null if it never can (a limit below `need`).
   */
  freeAt(dim: Dim, need: number, now: Ms = this.clock()): Ms | null {
    const win = DIMENSIONS[dim] * 1000;
    if (this.limits[dim] < need) return null;
    const inWindow = this.calls.filter((t) => t > now - win);
    const leave = inWindow.length - (this.limits[dim] - need); // this many of the oldest must leave
    let at = leave > 0 ? inWindow[leave - 1] + win : now;
    const h = this.headerRemaining.get(dim);
    if (h && now - h[1] < win && h[0] - this.calls.filter((t) => t > h[1]).length < need) at = Math.max(at, h[1] + win);
    return at;
  }

  /** When this kind of call can go again: every window it needs, and any wait RTT asked for. */
  freeFor(interactive: boolean, now: Ms = this.clock()): Ms | null {
    let at = this.blockedUntil != null ? Math.max(now, this.blockedUntil) : now;
    for (const dim of DIMS) {
      const t = this.freeAt(dim, this.need(dim, interactive), now);
      if (t == null) return null;
      at = Math.max(at, t);
    }
    return at;
  }

  remaining(dim: Dim, now: Ms = this.clock()): number {
    let ours = this.limits[dim] - this.used(now, DIMENSIONS[dim]);
    const h = this.headerRemaining.get(dim);
    if (h) {
      const [value, seen] = h;
      const since = this.calls.filter((t) => t > seen).length;
      if (now - seen < DIMENSIONS[dim] * 1000) ours = Math.min(ours, value - since); // a header holds within its window
    }
    return Math.max(ours, 0);
  }

  canSpend(interactive: boolean): boolean {
    const now = this.clock();
    if (this.blockedUntil != null && now < this.blockedUntil) return false;
    return this.spent(interactive) == null;
  }

  /** Which of this key's allowances is used up for this kind of call (the shortest first), or null if none is. */
  spent(interactive: boolean): Dim | null {
    const now = this.clock();
    return DIMS.find((dim) => this.remaining(dim, now) < this.need(dim, interactive)) ?? null;
  }

  spend(): void {
    if (this.unlimited) return;
    const now = this.clock();
    const cutoff = now - DIMENSIONS.week * 1000;
    while (this.calls.length && this.calls[0] < cutoff) this.calls.shift();
    this.calls.push(now);
    this.total += 1;
  }

  observe(status: number, headers: Record<string, string>): void {
    if (this.unlimited) return; // the simulator's pretend limits don't apply to the demo
    const now = this.clock();
    for (const dim of DIMS) {
      const lim = headers[`x-ratelimit-limit-${dim}`];
      const rem = headers[`x-ratelimit-remaining-${dim}`];
      if (lim && /^\d+$/.test(lim)) this.limits[dim] = Number(lim);
      if (rem && /^-?\d+$/.test(rem)) this.headerRemaining.set(dim, [Number(rem), now]);
    }
    if (status === 429) {
      const ra = headers["retry-after"] ?? "60";
      const secs = /^\d+$/.test(ra) ? Number(ra) : 60;
      this.blockedUntil = now + Math.max(secs, 1) * 1000;
    }
  }

  /** Seconds between background re-fetches of one train, so the hour isn't used up early. */
  refreshInterval(floor = 30): number {
    const left = this.remaining("hour") - this.reserve;
    if (left <= 0) return 600;
    return Math.max(floor, 3600 / left);
  }

  state(): BudgetState {
    const now = this.clock();
    const remaining = Object.fromEntries(DIMS.map((d) => [d, this.remaining(d, now)])) as Record<Dim, number>;
    return {
      limits: { ...this.limits },
      remaining,
      blockedUntil: this.blockedUntil != null && this.blockedUntil > now ? this.blockedUntil : null,
      callsMade: this.total,
    };
  }
}
