// The one place that knows where the app is running. Everything else talks to these interfaces.
//   Android (Capacitor): native HTTP straight to data.rtt.io (no CORS), key in the app's private Preferences.
//   Browser (dev, tests, a future desktop build): fetch through the host's /rtt relay, localStorage.
// An iOS build would reuse the Capacitor branch as it stands.
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { API_VERSION, FetchHttp, type Http, type HttpResponse, NetworkError, RTT_BASE } from "../core/http";
import type { KeyValueStore } from "../core/rtt";

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0-dev";
export const native = Capacitor.isNativePlatform();
export const platformName = Capacitor.getPlatform(); // "android", "ios" or "web"

const lower = (h: Record<string, string> | undefined) =>
  Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));

/** Capacitor's native HTTP: real requests from the phone, so RTT's missing CORS headers don't matter. */
class NativeHttp implements Http {
  async get(path: string, params: Record<string, string>, token?: string | null): Promise<HttpResponse> {
    try {
      const r = await CapacitorHttp.get({
        url: `${RTT_BASE}${path}`,
        params,
        headers: { Version: API_VERSION, Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        connectTimeout: 10_000,
        readTimeout: 15_000,
      });
      let body: unknown = r.data;
      if (typeof r.data === "string") {
        const text: string = r.data;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { error: text.slice(0, 300) };
        }
      }
      return { status: r.status, headers: lower(r.headers), body: r.status === 204 ? null : body };
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : "network");
    }
  }
}

class PreferencesStore implements KeyValueStore {
  async get(key: string) {
    return (await Preferences.get({ key })).value;
  }
  async set(key: string, value: string) {
    await Preferences.set({ key, value });
  }
  async remove(key: string) {
    await Preferences.remove({ key });
  }
}

class LocalStore implements KeyValueStore {
  async get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: the key lasts this session only */
    }
  }
  async remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
  }
}

export const rttHttp: Http = native ? new NativeHttp() : new FetchHttp("/rtt");
export const store: KeyValueStore = native ? new PreferencesStore() : new LocalStore();

/** GET some JSON from anywhere (the update check). Native HTTP on the phone, fetch in a browser. */
export async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  if (native) {
    const r = await CapacitorHttp.get({ url, headers: { Accept: "application/vnd.github+json" }, connectTimeout: 10_000, readTimeout: 15_000 });
    return { status: r.status, body: typeof r.data === "string" ? JSON.parse(r.data || "null") : r.data };
  }
  const r = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
