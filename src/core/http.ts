// The one door to the network. Each platform supplies an Http: Android uses Capacitor's native HTTP straight to
// data.rtt.io (no CORS limits); a browser goes through its host's /rtt relay; demo mode and tests use the simulator.
export interface HttpResponse {
  status: number;
  headers: Record<string, string>; // lower-case names
  body: unknown; // parsed JSON, or null (e.g. 204)
}

export interface Http {
  get(path: string, params: Record<string, string>, token?: string | null): Promise<HttpResponse>;
}

export class NetworkError extends Error {}

export const RTT_BASE = "https://data.rtt.io";
export const API_VERSION = "2026-07-25"; // newest version in RTT's changelog, pinned so shapes don't shift under us

/** fetch-based Http, for a browser whose host relays `${base}/...` to data.rtt.io (see vite.config.ts). */
export class FetchHttp implements Http {
  constructor(private base = "/rtt") {}

  async get(path: string, params: Record<string, string>, token?: string | null): Promise<HttpResponse> {
    const url = `${this.base}${path}?${new URLSearchParams(params)}`;
    let r: Response;
    try {
      r = await fetch(url, {
        headers: { Version: API_VERSION, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.name : "network");
    }
    const text = await r.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text.slice(0, 300) };
      }
    }
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { status: r.status, headers, body };
  }
}
