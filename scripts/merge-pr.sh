#!/bin/sh
# Merge a PR only when it has really been tested: `npm run merge -- <PR number>`.
# - Every required check ran on the PR's current head and passed. "Skipped" is not passed (GitHub would accept it).
# - The merge is pinned to that head commit, so a push that lands meanwhile makes the merge fail, not slip through.
# - Process work (chore/, ci/, test/, docs/, refactor/ branches) is labelled "process" first, out of release notes.
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
# Release notes (generated, and shown in the app's Settings) leave out PRs labelled "process" (.github/release.yml):
# work on how the repo runs, which users never see. The branch's type says which those are. CI doesn't run on a label.
branch=$(gh pr view "$n" -R "$repo" --json headRefName --jq .headRefName)
case "$branch" in
  chore/* | ci/* | test/* | docs/* | refactor/*)
    gh label create process -R "$repo" --color ededed --description "How the repo runs: left out of release notes" \
      > /dev/null 2>&1 || true # already there (if it really failed, the next line says so)
    gh pr edit "$n" -R "$repo" --add-label process > /dev/null
    echo "merge: labelled PR #$n \"process\" ($branch), so release notes leave it out." >&2
    ;;
esac
gh pr merge "$n" -R "$repo" --rebase --delete-branch --match-head-commit "$head"
