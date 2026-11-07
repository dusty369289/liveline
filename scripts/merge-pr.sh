#!/bin/sh
# Merge a PR only when it has really been tested: `npm run merge -- <PR number>`.
# - Every required check ran on the PR's current head and passed. "Skipped" is not passed (GitHub would accept it).
# - The merge is pinned to that head commit, so a push that lands meanwhile makes the merge fail, not slip through.
# Merging happens only when the owner says so (AGENTS.md). This script makes sure it's safe when they do.
set -eu
n="${1:?usage: npm run merge -- <PR number>}"
repo="dusty369289/liveline"

head=$(gh pr view "$n" -R "$repo" --json headRefOid --jq .headRefOid)
checks=$(gh pr checks "$n" -R "$repo" --required --json name,state --jq '.[] | "\(.name)=\(.state)"')
if [ -z "$checks" ]; then
  echo "merge: PR #$n has no required checks reported yet. Wait for CI." >&2
  exit 1
fi
bad=$(printf '%s\n' "$checks" | grep -v '=SUCCESS$' || true)
if [ -n "$bad" ]; then
  echo "merge: refusing PR #$n: not every required check ran and passed on ${head}:" >&2
  printf '  %s\n' $bad >&2
  exit 1
fi
echo "merge: PR #$n passed $(printf '%s\n' "$checks" | tr '\n' ' ')on ${head}." >&2
gh pr merge "$n" -R "$repo" --rebase --delete-branch --match-head-commit "$head"
