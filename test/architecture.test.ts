// The rules in AGENTS.md that a machine can check, so they hold even when a session forgets them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(n) ? [p] : [];
  });
}
const rel = (p: string) => relative(ROOT, p);
const source = files(SRC, /\.ts$/);
const text = (p: string) => readFileSync(p, "utf8");
/** Code without comments, so a rule isn't tripped by a comment that names the thing it forbids. */
const code = (p: string) => text(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const importsOf = (p: string) => [...text(p).matchAll(/^import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);

describe("layers point inward", () => {
  // core: no DOM, no Capacitor, no UI. platform: the only Capacitor code. ui: never Capacitor directly.
  const layer = (p: string) => rel(p).split("/")[1];
  it("core imports only core", () => {
    const bad = source.filter((p) => layer(p) === "core")
      .flatMap((p) => importsOf(p).filter((i) => !i.startsWith("./") || i.includes("..")).map((i) => `${rel(p)} imports ${i}`));
    expect(bad).toEqual([]);
  });
  it("only platform/ touches Capacitor", () => {
    const bad = source.filter((p) => layer(p) !== "platform")
      .flatMap((p) => importsOf(p).filter((i) => i.startsWith("@capacitor")).map((i) => `${rel(p)} imports ${i}`));
    expect(bad).toEqual([]);
  });
  it("core never touches the page", () => {
    const bad = source.filter((p) => layer(p) === "core" && /\b(document|window|localStorage)\./.test(code(p))).map(rel);
    expect(bad).toEqual([]);
  });
});

describe("one place for each thing", () => {
  it("network requests only from platform/ and core/http.ts", () => {
    const allowed = ["src/platform/index.ts", "src/core/http.ts"];
    const bad = source.filter((p) => !allowed.includes(rel(p)) && /\b(fetch\(|CapacitorHttp|XMLHttpRequest)/.test(code(p))).map(rel);
    expect(bad).toEqual([]);
  });

  it("storage names only in the two registries (renaming one loses users' data)", () => {
    const allowed = ["src/core/keys.ts", "src/ui/store/keys.ts"];
    const bad = source.filter((p) => !allowed.includes(rel(p)) && /["'`](liveline|rtt)\.[a-z]+["'`]/.test(code(p))).map(rel);
    expect(bad).toEqual([]);
  });

  it("localStorage only through Pref (and the platform's browser key store, which has nowhere private)", () => {
    const allowed = ["src/ui/store/pref.ts", "src/platform/index.ts"];
    const bad = source.filter((p) => !allowed.includes(rel(p)) && /\blocalStorage\b/.test(code(p))).map(rel);
    expect(bad).toEqual([]);
  });

  it("markup reaches the page only through the escaping template (html.ts)", () => {
    const bad = source.filter((p) => rel(p) !== "src/ui/html.ts" && /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(code(p))).map(rel);
    expect(bad).toEqual([]);
  });

  it("raw colours only in the theme", () => {
    const css = files(join(ROOT, "public", "css"), /\.css$/).filter((p) => !rel(p).startsWith("public/css/themes/"));
    const colour = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;
    const bad = [...css, ...source].filter((p) => colour.test(code(p).replace(/href="#[^"]*"|#\/[\w/?=&-]*/g, ""))).map(rel);
    expect(bad).toEqual([]);
  });
});

describe("small files", () => {
  // A file past this has two jobs: split it (pages/, views/, components/, widgets/, store/).
  const LIMIT = 300;
  const sizes = [...source, ...files(join(ROOT, "test"), /\.ts$/).filter((p) => !p.includes("/golden/"))]
    .map((p) => [rel(p), text(p).split("\n").length] as const);

  it(`no source file over ${LIMIT} lines`, () => {
    expect(sizes.filter(([p, n]) => n > LIMIT && !EXEMPT[p])).toEqual([]);
  });

  it("no exempt file grows past its own cap", () => {
    expect(sizes.filter(([p, n]) => EXEMPT[p] && n > EXEMPT[p].max).map(([p, n]) => `${p}: ${n} > ${EXEMPT[p].max}`)).toEqual([]);
  });
});

/**
 * Bigger on purpose, each with its reason, and capped near its size when exempted, so it can't quietly outgrow the
 * reason. Raising a cap, or adding a file, needs a reason a reviewer would accept.
 */
const EXEMPT: Record<string, { reason: string; max: number }> = {
  "src/core/simulator.ts": { reason: "two whole routes' timetables and their generator: data, not tangled logic", max: 460 },
  "src/core/engine.ts": { reason: "one algorithm (position and estimate) whose parts share state; split only with care", max: 440 },
  "src/core/rtt.ts": { reason: "the RTT client: auth, budget, cache and endpoints are one object by design", max: 325 },
};
