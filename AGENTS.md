# LiveLine: how it works

For coding agents (and people) working on this repo. Keep it current: when behaviour, structure or a command changes,
change this file in the same commit. `README.md` is for users.

## What it is

A live train tracker for Great Britain, as an Android app. Type a station and a time, pick a train, and watch it move
along its route. It shows every call **and every timing point it passes** (junctions, through stations), with booked,
actual and estimated times. Between reports it places the train on the line rather than freezing at the last station.
Data comes from the Realtime Trains (RTT) next-generation API at `https://data.rtt.io`, called from the phone with the
user's own key. There is no server.

## Two codebases, held together by golden tests

- **`app/`: the product.** TypeScript, Vite, Vitest, Capacitor 8. Android now; the core is platform-free, so iOS
  (Capacitor) or a desktop localhost build can be added later. Plain CUBE CSS, no framework.
- **`src/liveline/`: the Python reference.** FastAPI, Jinja, httpx, Typer, uv, Python 3.14+. Behaviour is worked out and
  tested here first. It also runs as a local web app and CLI (`uv run liveline serve`), with an optional hosted mode
  (`serve --hosted`, `Dockerfile`) where each browser brings its own key in an AES-GCM-sealed HttpOnly cookie.
- `scripts/export_golden.py` writes the Python results (parsed fixtures, engine timelines at many moments, stop
  summaries, simulator answers) to `app/test/golden/`. `app/test/parity.test.ts` must match them exactly. After
  changing Python behaviour, re-export and commit the golden files with the change.

```
app/src/
  core/      no DOM, no Capacitor: time (UK DST), models, parse, engine, budget, rtt client, simulator, stations,
             rail (key handling, tiers, demo), update (GitHub release check)
  platform/  the only Capacitor code: native HTTP, key storage (Preferences), app version
  ui/        hash router (app.ts), views (escaping html`` template), live marker (live.ts), prefs (localStorage)
  data/      bundled station list (ODbL, see its README)
app/android/ Capacitor's Android project (committed). versionName/versionCode come from app/package.json.
src/liveline/
  domain/    frozen models, parsing RTT JSON, live position + estimate engine. No I/O
  sources/   transport (the only HTTP code), RTT client, token handling, budget + cache, simulator, station list
  services/  behaviour the interfaces call (board, service, hosted keys)
  web/       FastAPI app, templates, static
  cli/       Typer: serve, board, train, token, record
docs/rtt-openapi.yml   RTT's OpenAPI spec (MIT), used by tests/test_schema.py
```

Dependencies point inward only (ui -> core, platform -> core; interfaces -> services -> sources -> domain). Clock and
transport are injected. HTTP lives only in `app/src/platform/`, `app/src/core/http.ts` and `sources/transport.py`.
Colours live only in the theme files (`app/public/css/themes/`, `src/liveline/web/static/css/themes/`).

**RTT sends no CORS headers**, so a web page can't call it directly. Android uses Capacitor's native HTTP. A browser build
goes through its host's `/rtt` relay (Vite's dev proxy).

## Rules that must hold

- **Keys never appear in code, logs, fixtures or screenshots.** RTT's terms: no token built into a distributed app, or
  it's revoked. The app ships with no key; each user pastes their own in Settings and it stays on their phone
  (Capacitor Preferences, app-private, Android backups off). The access token derived from it is cached under a SHA-256
  fingerprint, never the key itself. With no key the app is in **demo mode** (the simulator), clearly bannered.
- **The allowance is tiny.** Free and Hobbyist allow 10 a minute, 100 an hour and 1000 a day. Every real call goes
  through one budget (`core/budget.ts`, `sources/budget.py`) that obeys `X-RateLimit-Remaining-*` and `Retry-After`.
  Polling slows down to fit the budget rather than run out. Running out shows "busy" (with the last answer, marked
  stale), never "not found".
- **Be plain about limits.** Say when data is simulated, stale, estimated by us, or missing. Never pass our estimate off
  as RTT's forecast. RTT has no signal or berth data: never claim signals.
- **Tests never touch the network.** Fixtures are recordings (`tests/fixtures/rtt/real_*.json`) where we have them.
  Hand-written ones are named `spec_*.json` and carry a `_note` saying so. Recordings contain no tokens.
- **Nothing personal in tracked files.** `scripts/leak_check.py` runs in CI.

## Product behaviour

- **Board:** departures (or arrivals) at a station from a chosen time, default now, 60-minute window, optional
  "calling at" filter. Cached 60 s per query. Empty stock, staff-only calls and set-down-only rows are hidden unless
  "Show all".
- **Train view:** every location RTT returns, including passes. Calls are full rows, passes are small rows. Times:
  booked (public time, or working time for passes), then actual if reported, else RTT's forecast, else our estimate,
  each marked. Detailed-mode actuals show quarter minutes (¼ ½ ¾); our estimates are whole minutes.
- **Live position:** the last reported point and the next point give a section. Progress uses elapsed time against the
  working timetable's section time. It never passes an unreported point (holds at 95%) and says "No report at X yet"
  once the section has taken longer than booked plus 2 minutes.
- **Our estimate** carries the current delay forward. A late train can win back 75% of booked allowances (performance,
  engineering, pathing) and dwell beyond 30 s, but never leaves an advertised stop before its public time. Used only
  where RTT gives no forecast, or where RTT's forecast is impossible (earlier than the train could get there even
  winning back all slack). Labelled "est" either way. The tuning is a guess, not backtested.
- **Where it lost time:** the section between two reported points where lateness grew most, shown from 2 min.
- **Polling** (`app/src/core/poll.ts`): the marker moves every second on its own; the train is refetched when the next
  report can exist, never more than once a minute. Running: 20 s after it's due at the next point (60 to 120 s).
  Waiting at a station: just after its departure time. Not started: about a minute before it's due, at least every
  3 minutes. Overdue: every minute. Your stop over 40 minutes off: every 2 minutes. Arrived or cancelled: polling
  stops ("Journey over"). Passing your own stop doesn't stop it (you may want to watch it carry on). One tracked train costs about 45 calls an hour. The allowance's own floor
  (`Budget.refreshInterval`: `3600 / (calls left this hour - 10)`) can only slow it further, and background polls never
  touch the last 10 calls of the hour, kept for searches. Nothing polls while the app is in the background, and coming
  back fetches only if the planned poll is due. Manual Refresh on a train (`manualMinAge`) may go faster than the automatic polls but never into the
  search reserve: it refetches an answer over 15 s old while more than 30 calls are left this hour, over 60 s old with
  11 to 30 left, and not at all with 10 or fewer (the bar says why). Tapping sooner is free. A refresh also resets
  the automatic schedule, so it never adds a call on top.
- **Train page bar:** a thin bar sticks to the top while you scroll the route: how old the answer is (ticking each
  second, "Updating…" during a fetch), a refresh icon that spins during any fetch, and Jump to train.
- **Boards:** a "now" board updates itself every 2 minutes while on screen (a background call), for 15 minutes, then
  waits for Refresh. RTT charges one call however wide the window, so each board call asks for three hours
  (`FETCH_WINDOW`) and every board inside that answer (now, Later, Later again, Earlier back to it, the minute ticking
  over) is served from it with no call. The rows shown are those booked in the window, plus earlier ones still running
  late into it. Answers are kept 1 minute, or 5 minutes for a board starting an hour or more ahead
  (`FUTURE_BOARD_TTL`). The Python reference keeps its own simpler fetching and polling; this lives in the app.
- **Your stop:** a train opened from a board knows your stop and destination; the top panel gives "N min", stops away
  and platform (solid plate confirmed, outlined expected).
- **Tiers** come from entitlements and reported limits, not names: `allowDetailed` means Hobbyist features (detailed
  mode, headcodes, units), a full-allocation entitlement or over 100 an hour means Team or above, nothing means Free.
- **Rounding:** lateness is whole minutes toward zero (railway practice). Only the simulator rounds, halves up.
- **Updates:** Settings > "Check for updates" (and a once-a-day automatic check) reads
  `api.github.com/repos/dusty369289/liveline/releases/latest`. If it's newer, one tap ("Update now" in the banner on
  any page, or "Update to X" in Settings) runs `UpdaterPlugin` (`app/android/.../UpdaterPlugin.java`): download the
  APK, check its SHA-256 (GitHub's asset digest, else the release's `.apk.sha256`), install with PackageInstaller
  over the running version. Android asks once to allow installs from LiveLine (the plugin opens that screen and carries
  on when the user returns), shows its own confirmation unless it allows `USER_ACTION_NOT_REQUIRED` (Android 12+), and
  refuses an APK signed with another key. A browser build links to the release instead.
- **Updates keep the user's data.** Android keeps app data when the same package, signed with the same key, is
  installed over itself: the key (Capacitor Preferences) and journeys, recent stations and prefs (WebView
  localStorage at `https://localhost`). So never change `appId`, `server.androidScheme`, `server.hostname`, the
  signing key, or a storage key name (`rtt.key`, `rtt.access`, `liveline.*`) without a migration.
  `app/test/persistence.test.ts` pins them. A debug build is signed with a different key, so going from a debug
  build to a release needs one uninstall (which loses the data once).

## UI

The "Platform" look, from British rail signage: warm paper and navy ink (deep navy at night), Barlow and Barlow Semi
Condensed, navy sign plates for platforms, a thick Beck-style line with ringed stops, the train as the yellow warning
panel of a train front, and one giant "N min" number. No cards, boxes, glow, gradients or pills; hierarchy comes from
type. CUBE layers: `tokens, base, composition, block, utility, exception`; themes are token-only files. Phone first
(412 px), 44 px touch targets.

## RTT API essentials

- Only `data.rtt.io` works. The old `api.rtt.io` answers 418. Ignore tutorials using `serviceUid`/`runDate`.
- Auth: `Authorization: Bearer <token>`. Portal tokens are usually **refresh tokens**: `GET /api/get_access_token`
  swaps one for `{token, entitlements, validUntil}`. `GET /api/info` gives entitlements and the API version. We pin
  `Version: 2026-07-25`.
- `GET /gb-nr/location?code=RDG&timeFrom=...&timeWindow=60[&filterTo=PAD][&detailed=true]`: a board. 204 with no body
  means no services. A row without `departure` terminates here.
- `GET /gb-nr/service?uniqueIdentity=C12345:2026-11-07[&detailed=true]`: one train's run. A location whose `displayAs`
  is `PASS` **or null** is a pass, timed in `temporalData.pass`. `allowances` are in seconds.
- Times: `scheduleAdvertised` (public), `scheduleInternal` (working, may have half minutes), `realtimeActual`,
  `realtimeForecast`, `realtimeEstimate` (RTT's, when no report). Lateness fields are whole minutes.

Quirks seen in real answers (don't "fix" data to match the spec):
- Times come **without a UTC offset** and are UK local time; `query.timeFrom` has one. Parse naive times as Europe/London.
- `query.location.longCodes` are prefixed (`gb-nr:PADTON`); origin/destination long codes aren't, and those locations
  may have no `shortCodes`.
- `platform.forecast` is populated, though the spec says "not currently used".
- The spec's nullable enums leave out null; `tests/test_schema.py` adds it. `stockType` comes lowercase (`unit`).
- Detailed actuals have seconds at quarter-minute steps. Detailed boards include empty stock (`inPassengerService:
  false`, `OPERATIONAL_ONLY`, operator `ZZ`) and `BUS` rows.
- `status` can lag behind an actual; `realtimeAdvertisedLateness` can be negative.

## Commands

```sh
# App
cd app && npm ci
npm test                       # Vitest, including parity with the golden files
npm run build                  # tsc + Vite
npm run dev                    # browser dev server with the /rtt relay
scripts/android-build.sh debug # APK (needs JDK 21 and the Android SDK; see the script for paths)

# Python reference
uv sync
uv run pytest                  # everything except browser and live tests
uv run pytest -m ui            # phone/desktop screenshot matrix, then open .ui-report/index.html
uv run pytest -m live -n 0     # real RTT calls: costs allowance, needs RTT_TOKEN
uv run ruff check . && uv run ruff format --check .
uv run python scripts/export_golden.py   # after changing Python behaviour
uv run python scripts/leak_check.py
```

Python tests have a 10 s timeout each. Failures are kept in `.test-review/failures.log`, and a test that fails then
passes on the same code is reported as flaky until explained.

## How changes land

GitHub enforces these with a ruleset on `main` ("main: PRs and green checks"):
- **Every change is a pull request.** Nobody pushes to `main` directly, including the owner. Branch, push, open a PR.
- **Both CI checks must pass before merging:** `App (TypeScript)` (Vitest, tsc, Vite build) and `Python reference`
  (ruff, pytest, golden files match, leak check). The branch must be up to date with `main`.
- **History stays linear:** squash or rebase merges, no merge commits. No force-pushes to `main`, and it can't be deleted.
  Merged branches are deleted automatically.
- **One PR per piece of work.** Everything for one request goes on one branch and one PR: follow-up fixes are more
  commits on it, not new PRs. Commits inside it stay small and logical (rebase merge keeps them). The description says
  what changed, why, and how it was tested, including anything that couldn't be (for example, on a real phone).
- **Merge once the checks pass**, so open PRs don't pile up. Merging doesn't release: `main` may hold unreleased work.

What runs where:

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every PR, every push to `main` | tests, typecheck, web build, golden files, leak check. No Android build |
| `release.yml` | only when someone releases (Run workflow with a version, or a pushed tag `vX.Y.Z` on `main`) | the same CI, then the signed APK built as that version, then the tag and the GitHub Release |

Android compiling and publishing happen only in a release, so a PR never needs the signing key.

## Releases

Releasing is a choice, separate from merging. The version lives only in the release tag: `app/package.json` in the
repo says `0.0.0-dev`, and the Release workflow writes the real version in before building, so there are no
version-bump PRs. To release what's on `main`:

```sh
gh workflow run release.yml -f version=1.2.3     # or Actions > Release > Run workflow; or push a tag v1.2.3 on main
```

It refuses a version that isn't `X.Y.Z`, is already released, or isn't newer than the latest release (a phone wouldn't
take it as an update), and a tag that isn't on `main`. Then: the tests, a signed APK built as that version (checked
with apksigner and aapt2), the tag on that commit, and the Release with the APK and its `.sha256`. Semver: patch for
fixes, minor for features. versionCode is `major*10000 + minor*100 + patch` (at least 1), so every release installs over
the last. Signing reads `LIVELINE_KEYSTORE_FILE`, `LIVELINE_KEYSTORE_PASSWORD`, `LIVELINE_KEY_ALIAS`,
`LIVELINE_KEY_PASSWORD` (CI secrets) or a local, gitignored `app/android/keystore.properties`. Without them, a release
build is unsigned. A local build says `0.0.0-dev`, so its update check offers any release.

## Gotchas

- Python's `round()` sends halves to even; round explicitly where parity matters.
- Python UI tests share one frozen simulated minute, so the `fresh_allowance` fixture resets the budget per test.
- A paused Playwright clock freezes debounces too: use `page.clock.install(time=...)` and `run_for()`.
- Jinja escapes apostrophes (`isn&#39;t`); web tests compare `text(r)`.
- The CSP is injected only into production builds (`app/vite.config.ts`); it allows `api.github.com` for the update check.
