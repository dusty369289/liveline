// What can go wrong asking Realtime Trains, as error classes the UI tells apart (rtt.ts throws them; rail.ts and rtt.ts
// export them). Apart from the client so it stays one job: asking.
import type { Dim } from "./budget";
import { hm, type Ms } from "./time";

export class RttError extends Error {}
/** The key is missing, wrong, expired or revoked. */
export class AuthError extends RttError {}
/**
 * Not permanent: out of allowance, asked to wait, or RTT unreachable. Try again soon. `retryAt` is when RTT said
 * to try again, if it did, so the page names that one wait instead of its own.
 */
export class BusyError extends RttError {
  readonly retryAt: Ms | null;
  constructor(message: string, retryAt: Ms | null = null) {
    super(message);
    this.retryAt = retryAt;
  }
}
/** Busy because this device has no connection: retried the same way, but named honestly. */
export class OfflineError extends BusyError {}
const SPENT: Record<Dim, string> = {
  minute: "This key's calls for this minute are used up.",
  hour: "This key's calls for this hour are used up.",
  day: "This key's calls for the day are used up.",
  week: "This key's calls for the week are used up.",
};
/** For when the time can't be known: another app on the same key, say. */
const SOON: Record<Dim, string> = {
  minute: "Searches work again within a minute.",
  hour: "Searches work again as the hour's calls free up.",
  day: "Searches work again as the day's calls free up.",
  week: "Searches work again as the week's calls free up.",
};
/**
 * Busy because this key's own allowance is spent (our Budget refused before asking): not Realtime Trains' doing.
 * `searchesAt` is when a search could go again; `retryAt` is when the page's own retry, a background call that
 * can't use the calls kept for searches, could, so "tries again by itself at" comes true.
 */
export class AllowanceError extends BusyError {
  constructor(dim: Dim, searchesAt: Ms | null = null, retryAt: Ms | null = null) {
    // Rounded up to the minute, so the time shown is never before searches really work
    super(`${SPENT[dim]} ${searchesAt == null ? SOON[dim] : `Searches work again at ${hm(Math.ceil(searchesAt / 60_000) * 60_000)}.`}`, retryAt);
  }
}
