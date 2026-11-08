import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// A strict Content-Security-Policy in built apps (Android and web). Left out in development, where Vite's live reload
// needs a websocket and injected scripts. Network to RTT goes through native HTTP on Android, so connect-src only
// matters for the browser build (its /rtt relay) and the update check (api.github.com).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const csp = (): Plugin => ({
  name: "liveline-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<head>", `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
});

// The app is static: every page is drawn in the browser. In a browser (dev, tests, a future desktop build) RTT calls
// go to /rtt/* on the same origin, which the host relays to data.rtt.io (RTT sends no CORS headers). On Android they
// go straight to RTT through Capacitor's native HTTP.
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [csp()],
  build: { outDir: "dist", target: "es2022", sourcemap: true },
  server: {
    proxy: {
      "/rtt": { target: "https://data.rtt.io", changeOrigin: true, rewrite: (p) => p.replace(/^\/rtt/, "") },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000, // a hang is a bug, not a limit to raise
    // Locally a dot per test, failures in full and the summary: a passing run is a few lines, not one per file, which
    // is what an agent reads back each time. CI keeps the per-file list in its log. `--reporter=default` for it here.
    // The review reporter keeps the timing and flaky review, and failures.log, either way.
    reporters: [process.env.CI ? "default" : "dot", "./test/harness/review-reporter.ts"],
  },
});
