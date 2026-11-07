// Small stroke icons used in more than one place. Always paired with a name for screen readers (aria-label).
import { raw } from "../html";

export const REFRESH_ICON = raw('<svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');

/** A star: outlined, or filled once saved (CSS fills it on [aria-pressed="true"]). */
export const STAR_ICON = raw('<svg class="icon icon--star" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>');
