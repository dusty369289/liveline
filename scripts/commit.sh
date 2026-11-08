#!/bin/sh
# Commit named paths, and leave nothing half done: `npm run commit -- "<subject>" [-m "<body>"] <path>...`
# - Refuses if anything is already staged: a commit holds exactly the paths named here, never leftovers.
# - Checks the message first with the commit-msg hook itself (no second copy of its rules), in milliseconds rather
#   than after the full check.
# - Stages the paths and commits (the hooks run as usual). If the commit fails, it unstages them again, so a refused
#   commit never leaves files staged for a push to strand.
set -u
usage() {
  echo 'usage: npm run commit -- "<subject>" [-m "<body>"] <path>...' >&2
  exit 2
}
[ $# -ge 2 ] || usage
subject=$1
shift
body=""
if [ "$1" = "-m" ]; then
  [ $# -ge 3 ] || usage
  body=$2
  shift 2
fi
[ $# -ge 1 ] || usage

staged=$(git diff --cached --name-only)
if [ -n "$staged" ]; then
  echo "commit: these files are already staged; commit or unstage them first:" >&2
  printf '  %s\n' "$staged" >&2
  exit 1
fi

msg=$(mktemp)
trap 'rm -f "$msg"' EXIT
printf '%s\n' "$subject" > "$msg"
[ -z "$body" ] || printf '\n%s\n' "$body" >> "$msg"
sh "$(dirname "$0")/git-hooks/commit-msg" "$msg" || exit 1

unstage() {
  git restore --staged -- "$@" 2>/dev/null || git reset -q -- "$@" 2>/dev/null || true
}
if ! git add -- "$@"; then
  unstage "$@"
  exit 1
fi
if ! git commit -q -F "$msg"; then
  unstage "$@"
  echo "commit: the commit failed, so the paths were unstaged again. Fix what it found, then run this again." >&2
  exit 1
fi
git log -1 --format='commit: %h %s' >&2
