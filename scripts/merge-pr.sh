#!/bin/sh
# Merge a PR only when it has really been tested: `npm run merge -- <PR number>`.
# - Each required check (REQUIRED, the job names in ci.yml and the "main" ruleset) ran on the PR's current head and
#   passed. "Skipped" is not passed (GitHub would accept it), and a check that never reported is not passed either.
# - The PR's title and body are clean (history-check.mjs: no AI attribution, nothing personal). CI checks them too;
#   this catches an edit made since.
# - The merge is pinned to that head commit, so a push that lands meanwhile makes the merge fail, not slip through.
# - Process work (chore/, ci/, test/, docs/, refactor/ branches) is labelled "process" first, out of release notes.
# Merging happens only when the owner says so (AGENTS.md). This script makes sure it's safe when they do.
set -eu
n="${1:?usage: npm run merge -- <PR number>}"
repo="dusty369289/liveline"
REQUIRED="Checks Browser"

head=$(gh pr view "$n" -R "$repo" --json headRefOid --jq .headRefOid)
# gh exits non-zero while checks are pending or failed: carry on, so the refusal below says which
checks=$(gh pr checks "$n" -R "$repo" --required --json name,state --jq '.[] | "\(.name)=\(.state)"' || true)
bad=""
for name in $REQUIRED; do
  state=$(printf '%s\n' "$checks" | sed -n "s/^$name=//p" | head -n 1)
  [ "$state" = "SUCCESS" ] || bad="$bad $name=${state:-not reported}"
done
if [ -n "$bad" ]; then
  echo "merge: refusing PR #$n: not every required check ran and passed on ${head}:" >&2
  for b in $bad; do echo "  $b"; done >&2
  exit 1
fi

title=$(gh pr view "$n" -R "$repo" --json title --jq .title)
body=$(gh pr view "$n" -R "$repo" --json body --jq .body)
if ! PR_TITLE="$title" PR_BODY="$body" node "$(dirname "$0")/history-check.mjs"; then
  echo "merge: refusing PR #$n: edit its title or body first." >&2
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
