#!/bin/sh
# Open a PR with checked text: `npm run pr -- --title "<title>" --body-file <file.md>`.
# A PR's title and body are public the moment it's opened, before CI or the merge script can check them. So they go
# through history-check.mjs first (no AI attribution, nothing personal), and gh gets the very file that was checked.
# --body, --draft and --fill are refused: text that didn't come from the checked file, or a draft (CI skips its jobs).
set -eu
usage() {
  echo 'usage: npm run pr -- --title "<title>" --body-file <file.md>' >&2
  exit 2
}
title=""
file=""
while [ $# -gt 0 ]; do
  case "$1" in
    -t | --title) [ $# -ge 2 ] || usage; title=$2; shift 2 ;;
    -F | --body-file) [ $# -ge 2 ] || usage; file=$2; shift 2 ;;
    -b | --body | -d | --draft | -f | --fill | --fill-first | --fill-verbose)
      echo "pr: $1 isn't allowed: the text comes only from --body-file, which is checked first, and PRs are never drafts." >&2
      exit 2 ;;
    *) echo "pr: unexpected argument $1." >&2; usage ;;
  esac
done
[ -n "$title" ] && [ -n "$file" ] || usage
if [ ! -f "$file" ]; then
  echo "pr: no body file at $file." >&2
  exit 2
fi

if ! PR_TITLE="$title" PR_BODY="$(cat "$file")" node "$(dirname "$0")/history-check.mjs"; then
  echo "pr: not opened: fix the title or the body file first." >&2
  exit 1
fi
gh pr create -R dusty369289/liveline --base main --title "$title" --body-file "$file"
