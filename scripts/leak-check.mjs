#!/usr/bin/env node
// Fail if a tracked file mentions something personal: the owner's machines, servers, other projects or contact
// details. The words themselves aren't listed (that would leak them): each is stored as the start of its SHA-256,
// and every word and pair of words in every tracked file is hashed and compared. Extra words can go in
// notes/leak-words.txt (gitignored, one per line), which only exists in a dev checkout.
//
// Run: npm run leak-check. Exit 1 lists file:line for each hit.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BANNED = new Set([
  "dcebedde787693c6", "669d010f4e4be008", "6616206a8e67a0e9", "83e7d25729f4f491", "9985c202d7aa3267",
  "f8028986316ac593", "e71edc3b90b4c36d", "96b98f8a7417f899", "db7b1de406b0d24a",
]);

// Personal by shape, whoever's they are.
const PATTERNS = [
  /\/(?:var\/)?home\/(?!linuxbrew\b)[a-z][\w.-]*\//i, // someone's home directory
  /[\w.+-]+@(?:gmail|outlook|hotmail|yahoo|icloud|proton(?:mail)?)\.\w+/i, // a personal email
];

const SKIP = new Set(["package-lock.json"]);
const SKIP_SUFFIX = [".png", ".jpg", ".webp", ".woff2", ".ico", ".jar", ".keystore", ".jks"];

const digest = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function files() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => f && !SKIP.has(f) && !SKIP_SUFFIX.some((s) => f.endsWith(s)) && existsSync(join(ROOT, f)));
}

const banned = new Set(BANNED);
const extra = join(ROOT, "notes", "leak-words.txt");
if (existsSync(extra)) {
  for (const w of readFileSync(extra, "utf8").split("\n")) if (w.trim()) banned.add(digest(w.trim().toLowerCase()));
}

const hits = [];
const all = files();
for (const name of all) {
  let text;
  try {
    text = readFileSync(join(ROOT, name), "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary
  text.split("\n").forEach((line, i) => {
    const words = line.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const grams = [...words, ...words.slice(1).map((w, j) => `${words[j]} ${w}`)];
    if (grams.some((g) => banned.has(digest(g))) || PATTERNS.some((p) => p.test(line))) hits.push(`${name}:${i + 1}`);
  });
}
if (hits.length) {
  console.log(["Personal details found in tracked files:", ...hits.map((h) => `  ${h}`)].join("\n"));
  process.exit(1);
}
console.log(`leak check: ${all.length} files clean`);
