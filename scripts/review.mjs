#!/usr/bin/env node
// The test review from the command line (state in .test-review/, see test/harness/review.ts):
//   npm run review                                        what's queued as slow, and what's flaky
//   npm run review -- accept "<test id>" --reason "..."   take a test's new time as normal, saying why
//   npm run review -- explain "<test id>" --reason "..."  say why a test was flaky, and what was done
// Runs the TypeScript directly with Node's type stripping.
import { TestReview } from "../test/harness/review.ts";

const store = new TestReview();

const [cmd, id, flag, ...rest] = process.argv.slice(2);
const reason = flag === "--reason" ? rest.join(" ").trim() : "";

if (!cmd) {
  const { queue, flaky } = store.pending();
  for (const [t, q] of queue) console.log(`SLOW: ${t}: ${q.seen} ms, usually ${Math.round(q.baseline)} ms (since ${q.since})`);
  for (const [t, f] of flaky) console.log(`FLAKY: ${t} (since ${f.since})`);
  if (!queue.length && !flaky.length) console.log("Nothing slow or flaky.");
  process.exit(0);
}
if (!id || !reason) {
  console.error('Usage: npm run review -- accept|explain "<test id>" --reason "what was looked at and why"');
  process.exit(2);
}
const ok = cmd === "accept" ? store.accept(id, reason) : cmd === "explain" ? store.explain(id, reason) : null;
if (ok === null) {
  console.error(`Unknown command "${cmd}": accept or explain.`);
  process.exit(2);
}
console.log(ok ? `Done. Logged in .test-review/accepted.log.` : `"${id}" isn't ${cmd === "accept" ? "queued as slow" : "listed as flaky"}.`);
process.exit(ok ? 0 : 1);
