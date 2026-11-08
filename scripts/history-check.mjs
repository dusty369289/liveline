#!/usr/bin/env node
// Check what the commit hooks can't vouch for: commits made elsewhere (or with hooks skipped) and PR text, which is
// public the moment it's written. Each commit's author and committer must be the owner (scripts/owner.sh), and no
// message, PR title or PR body may carry AI attribution (scripts/attribution.re) or anything personal (the leak
// check's words and shapes).
//
//   node scripts/history-check.mjs [git rev-list arguments]   e.g. origin/main..HEAD, or <sha> --not --remotes
//   PR_TITLE, PR_BODY (environment, never interpolated into a shell): checked too when set.
//   PR_AUTHOR: the PR author's login. dependabot[bot] expects Dependabot's identities instead and skips the body.
//
// Run by pre-push (the commits being pushed), CI's Checks job (the PR's commits and text), open-pr.sh (the text,
// before it's public) and merge-pr.sh.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { linesWithLeaks } from "./leak-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** OWNER_NAME and OWNER_EMAIL from owner.sh. */
export const OWNER = Object.fromEntries(readFileSync(join(HERE, "owner.sh"), "utf8").split("\n")
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const ATTRIBUTION = new RegExp(readFileSync(join(HERE, "attribution.re"), "utf8").trim(), "im");

/** What's wrong with a piece of public text, as sentences naming `what`; empty if nothing. */
export function textProblems(what, text) {
  const out = [];
  if (ATTRIBUTION.test(text)) out.push(`${what} carries AI attribution (a co-author trailer, 'Generated with' or a session link)`);
  const leaks = linesWithLeaks(text);
  if (leaks.length) out.push(`${what} has personal details on line ${leaks.join(", ")}`);
  return out;
}

/** Dependabot's PRs: its login as GitHub reports the PR's author (no human login can hold brackets). */
export const DEPENDABOT = "dependabot[bot]";
const OWNER_ID = { name: OWNER.OWNER_NAME, email: OWNER.OWNER_EMAIL };
// The identities Dependabot's commits carry: authored by the bot, committed by GitHub, which makes them
const DEPENDABOT_IDS = {
  author: { name: DEPENDABOT, email: "49699333+dependabot[bot]@users.noreply.github.com" },
  committer: { name: "GitHub", email: "noreply@github.com" },
};

/** What's wrong with the commits `git rev-list <args>` names: identity, then each message. `prAuthor` is the PR's. */
export function commitProblems(args, cwd = process.cwd(), prAuthor = "") {
  if (!args.length) return [];
  const log = execFileSync("git", ["log", "--format=%h%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e", ...args], { cwd, encoding: "utf8" });
  const out = [];
  for (const entry of log.split("\x1e").map((e) => e.replace(/^\n/, "")).filter(Boolean)) {
    const [sha, an, ae, cn, ce, body] = entry.split("\x00");
    for (const [role, name, email] of [["author", an, ae], ["committer", cn, ce]]) {
      const want = prAuthor === DEPENDABOT ? DEPENDABOT_IDS[role] : OWNER_ID;
      if (name !== want.name || email !== want.email) {
        out.push(`commit ${sha}: the ${role} is ${name} <${email}>, not ${want.name} <${want.email}>`);
      }
    }
    out.push(...textProblems(`commit ${sha}'s message`, body));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prAuthor = process.env.PR_AUTHOR ?? "";
  // A Dependabot PR's body is the upstream changelog (its contributors' addresses, their AI co-author trailers): not
  // ours to edit, and only the title reaches release notes. Its commit messages and title are still checked.
  const body = prAuthor === DEPENDABOT ? "" : process.env.PR_BODY;
  const problems = [
    ...commitProblems(process.argv.slice(2), process.cwd(), prAuthor),
    ...(process.env.PR_TITLE ? textProblems("the PR title", process.env.PR_TITLE) : []),
    ...(body ? textProblems("the PR body", body) : []),
  ];
  if (problems.length) {
    console.error(["history check:", ...problems.map((p) => `  ${p}`)].join("\n"));
    console.error("history check: fix the commits or the PR text, then try again. To reset every commit on the branch"
      + " to the owner's identity:\n  git rebase --exec \"git commit --amend --no-edit --reset-author\" liveline/main");
    process.exit(1);
  }
}
