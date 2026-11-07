// One stored preference: a name from KEYS, a fallback, and JSON in localStorage (the app's own WebView storage on
// Android). Private mode or blocked storage reads the fallback and forgets writes, so nothing here throws.
import type { Key } from "./keys";

export class Pref<T> {
  constructor(readonly key: Key, private readonly fallback: T) {}

  get(): T {
    try {
      const v = localStorage.getItem(this.key);
      return v === null ? this.fallback : (JSON.parse(v) as T);
    } catch {
      return this.fallback;
    }
  }

  set(value: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(value));
    } catch {
      /* private mode: forget it */
    }
  }
}
