// Offline station search over the bundled list (src/data/stations.json, ODbL; see src/data/README.md). No API calls.
// Port of src/liveline/sources/stations.py.
export interface Station {
  name: string;
  crs: string;
  lat: number | null;
  lon: number | null;
}

// Big stations people most likely mean when a short prefix fits several ("padd" is Paddington before Paddock Wood).
const MAJOR = new Set(
  ("PAD EUS KGX STP LST LBG WAT VIC CHX CST FST MYB MOG BFR CLJ SRA ZFD TCR LIV BHM BHI MAN MCV LDS LPY GLC GLQ EDB HYM " +
    "NCL YRK SHF NOT DBY LEI BRI BPW CDF RDG OXF CBG MKC PBO DON WKF HUD PRE CRE GTW SOU BMH EXD PLY SWI BTN ABD INV PER " +
    "STG DEE COV WVH NWP").split(" "),
);

export function norm(s: string): string {
  return s.toLowerCase().replaceAll("&", " and ").replaceAll("st.", "st ").replaceAll("'", "").replace(/[^a-z0-9]+/g, " ").trim();
}

export class StationIndex {
  private byCrsMap: Map<string, Station>;
  private normed: Array<[string, Station]>;

  constructor(readonly stations: Station[]) {
    this.byCrsMap = new Map(stations.map((s) => [s.crs, s]));
    this.normed = stations.map((s) => [norm(s.name), s]);
  }

  static fromRaw(raw: Array<Record<string, unknown>>): StationIndex {
    const out: Station[] = [];
    for (const r of raw) {
      const crs = String(r.crsCode ?? "").trim().toUpperCase();
      const name = String(r.stationName ?? "").trim();
      if (crs.length === 3 && name) {
        out.push({ name, crs, lat: typeof r.lat === "number" ? r.lat : null, lon: typeof r.long === "number" ? r.long : null });
      }
    }
    return new StationIndex(out);
  }

  byCrs(code: string): Station | undefined {
    return this.byCrsMap.get(code.trim().toUpperCase());
  }

  search(query: string, limit = 8): Station[] {
    const q = norm(query);
    if (!q) return [];
    const exact = query.trim().length === 3 ? this.byCrs(query) : undefined;
    const parts = q.split(" ");
    const scored: Array<[number, string, Station]> = [];
    for (const [name, st] of this.normed) {
      if (st === exact) continue;
      const words = name.split(" ");
      let score: number;
      if (name === q) score = 1;
      else if (name.startsWith(q)) score = 2;
      else if (words.some((w) => w.startsWith(q))) score = 3;
      else if (parts.every((p) => words.some((w) => w.startsWith(p)))) score = 4;
      else if (name.includes(q)) score = 5;
      else continue;
      if (MAJOR.has(st.crs) && score > 1) score -= 1.5;
      scored.push([score, name, st]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const out = exact ? [exact] : [];
    return out.concat(scored.slice(0, limit - out.length).map((x) => x[2]));
  }

  /** Best guess for what someone typed: "Reading (RDG)", a CRS code, or the top search hit. */
  resolve(text: string): Station | undefined {
    const t = text.trim();
    if (!t) return undefined;
    const m = /\(([A-Za-z]{3})\)\s*$/.exec(t);
    if (m && this.byCrs(m[1])) return this.byCrs(m[1]);
    if (t.length === 3 && this.byCrs(t)) return this.byCrs(t);
    return this.search(t, 1)[0];
  }
}
