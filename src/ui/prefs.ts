// Small per-device preferences (recent stations, saved journeys, the passes toggle, the train being followed).
// localStorage: it lives in the app's own WebView storage on Android. The RTT key is NOT kept here (platform store).
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: forget it */
    }
  },
};
