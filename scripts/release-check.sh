#!/bin/sh
# The Version job of release.yml: may this run release, and as which version? Refuses (with a GitHub ::error::) unless
# - the run is from main: a tag push whose commit is on main, or "Run workflow" on main (a run started from any
#   other branch is refused even if its commit is on main, because its workflow file and build come from that branch)
# - the commit is on origin/main, whatever started the run: only merged code becomes the next update
# - the version is X.Y.Z (no leading zeros) with minor and patch at most 99, newer than the latest release
# Writes version= and sha= to $GITHUB_OUTPUT. Tested in test/release-check.test.ts with a fake gh.
# These guard against mistakes. Anyone who can push could also edit this file on a branch; that's why a branch run
# is refused before anything here is trusted further, and why releasing stays with the owner.
set -eu

# versionCode is major*10000 + minor*100 + patch (android/app/build.gradle), so minor or patch over 99 would collide
# with the next minor or major: 0.1.100 and 0.2.0 would both be 200, and phones would refuse or skip an update.
MAX_PART=99

fail() { echo "::error::$1"; exit 1; }

case "$GITHUB_EVENT_NAME" in
  workflow_dispatch)
    [ "$GITHUB_REF" = refs/heads/main ] ||
      fail "Run the release from main, not $GITHUB_REF. Merge first, then Run workflow on main."
    v="${INPUT#v}" ;;
  push) v="${GITHUB_REF_NAME#v}" ;;
  *) fail "Releases start from Run workflow or a vX.Y.Z tag, not $GITHUB_EVENT_NAME." ;;
esac

# Digits and dots only first: grep -x matches line by line, so a second line could otherwise pass.
case "$v" in *[!0-9.]* | "") fail "\"$v\" isn't a version like 1.2.3." ;; esac
if ! printf '%s\n' "$v" | grep -Eqx '(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)'; then
  fail "\"$v\" isn't a version like 1.2.3."
fi
minor="$(echo "$v" | cut -d. -f2)"
patch="$(echo "$v" | cut -d. -f3)"
if [ "$minor" -gt "$MAX_PART" ] || [ "$patch" -gt "$MAX_PART" ]; then
  fail "v$v: minor and patch go up to $MAX_PART, because versionCode is major*10000 + minor*100 + patch. Go to the next minor or major instead."
fi

if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
  fail "$GITHUB_SHA ($GITHUB_REF_NAME) isn't on main. Release only what's been merged."
fi

if gh release view "v$v" -R "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
  fail "v$v is already released. Pick the next version."
fi
latest="$(gh release view -R "$GITHUB_REPOSITORY" --json tagName --jq .tagName 2>/dev/null || echo v0.0.0)"
if [ "$(printf '%s\n%s\n' "${latest#v}" "$v" | sort -V | tail -1)" != "$v" ]; then
  fail "v$v isn't newer than the latest release ($latest), so phones wouldn't take it as an update."
fi

echo "version=$v" >> "$GITHUB_OUTPUT"
echo "sha=$GITHUB_SHA" >> "$GITHUB_OUTPUT"
echo "Releasing v$v from $GITHUB_SHA"
