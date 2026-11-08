// What can go wrong asking Realtime Trains, as error classes the UI tells apart (rtt.ts throws them; rail.ts and rtt.ts
// export them). Apart from the client so it stays one job: asking.
import type { Dim } from "./budget";
import type { Ms } from "./time";

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
  minute: "This key's calls for this minute are used up. Searches work again within a minute.",
  hour: "This key's calls for this hour are used up. Searches work again as the hour's calls free up.",
  day: "This key's calls for the day are used up. Searches work again as the day's calls free up.",
  week: "This key's calls for the week are used up. Searches work again as the week's calls free up.",
};
/** Busy because this key's own allowance is spent (our Budget refused before asking): not Realtime Trains' doing. */
export class AllowanceError extends BusyError {
  constructor(dim: Dim) {
    super(SPENT[dim]);
  }
}
