# LiveLine: how it works, and how to work on it

For coding agents and people working on this repo. `README.md` is for users. **Keep this file true:** a change to
behaviour, structure, a rule or a command updates it in the same PR. Where a rule can be checked by a machine, it is
(`test/architecture.test.ts`, `test/persistence.test.ts`, `npm run leak-check`), and the check is named here.

## What it is

A live train tracker for Great Britain, as an Android app. Type a station and a time, pick a train, and watch it move
along its route. It shows every call **and every timing point it passes** (junctions, through stations), with booked,
actual and estimated times. Between reports it places the train on the line rather than freezing at the last station.
Data comes from the Realtime Trains (RTT) next-generation API at `https://data.rtt.io`, called from the phone with the
user's own key. There is no server.

TypeScript (strict), Vite, Vitest, Playwright, Capacitor 8 (Android; the core is platform-free, so iOS or a desktop
build can come later). Plain CUBE CSS, no framework.

## Layout

```
src/
  core/        no DOM, no Capacitor. Pure logic and the RTT client:
               time (UK DST), models, parse, engine (position + estimate), poll (when to ask again), budget,
               http (Http interface), rtt (client: auth, cache, budget), simulator (demo mode) and sim-stock (its
               trains' units), stations, rail (what the UI calls), update (release check), sha256 (synchronous: the
               simulator's delay profiles, the key's fingerprint), keys (core storage names, and the `StoreKey` type),
               and for the Train view: formation (coaches, units, letters, facilities), scene (stopped, running,
               the two ends), motion (how the drawn train moves), daylight (dawn, day, dusk or night)
  platform/    the only Capacitor code: native HTTP, the private key store, app version, the updater plugin bridge
  ui/
    app.ts       the router: a route name -> a Page class; draws it inside the chrome; problem pages
    pages/       one class per page (extends Page): load() data + markup, mount() wiring, dispose() timers
    views/       pure markup functions, data in, Html out (no DOM, no state)
    components/  markup shared by views (chrome, search form, time marks, facility icons)
    widgets/     DOM behaviour as classes: shared by pages, or split out of one (station suggestions, passing-point
                 folds, tabs)
    store/       everything kept on the device: Pref (one stored value), KEYS (every storage name), the lists
    updates.ts   the update check, banner and one-tap install
    live-train.ts  the train page while open: marker, polling, folds, the sticky bar
    train-scene.ts the Train view while showing: slides the scenery, platforms, wheels (art in views/scene-art.ts,
                   views/train-art.ts; colours in public/css/themes/scene.css)
    html.ts, routes.ts, format.ts   the escaping template, hash routes, text formatting
  data/        bundled station list (ODbL, see its README)
public/css/    CUBE layers; the only raw colours are in themes/platform.css
android/       Capacitor's Android project (committed), including UpdaterPlugin.java
test/          unit tests (*.test.ts), support.ts (shared doubles), fixtures/rtt/ (RTT recordings), golden/ (frozen
               answers), harness/ (the test review), ui/ (Playwright: *.spec.ts)
               readme/ (the README's pictures: playwright.readme.config.ts, not part of test:ui)
docs/img/      the README's pictures, light and dark, made by `npm run readme-pictures`
scripts/       git-hooks/ (pre-commit, commit-msg, pre-push), commit.sh (npm run commit), merge-pr.sh (npm run merge),
               history-check.mjs (commits and PR text), leak-check.mjs, owner.sh (the one commit identity),
               attribution.re (the AI attribution pattern), review.mjs, android-build.sh
```

## Architecture rules (checked by `test/architecture.test.ts`)

- **Layers point inward:** `core` imports only `core`, never touches `document`, `window` or `localStorage`. Only
  `platform` imports Capacitor. The UI reaches the platform through `src/platform/index.ts`.
- **One home for each thing:** network requests only in `platform/` and `core/http.ts`. Storage names only in
  `core/keys.ts` and `ui/store/keys.ts` (any quoted `liveline.`/`rtt.` name, in any case; the key store and `Pref`
  also take only registered names, by type). `localStorage` only through `Pref` (and the platform's browser key
  store). Markup reaches the page only through `html.ts` (`render`, `fragment`), so everything is escaped: no other
  `innerHTML`/`outerHTML` (`=` or `+=`), `insertAdjacentHTML`, `setHTMLUnsafe`, `createContextualFragment` or
  `document.write` (the escaping itself is tested in `test/html.test.ts`). Raw colours only in the theme.
- **Small files:** none over 300 lines. Three core files are exempt, each with its reason in the test; a new exemption
  needs a reason a reviewer would accept, not "it grew".
- Clock and transport are injected (`Rail`, `RttClient`, `SimTransport`, `TestReview`), so tests control time and
  never touch the network.

## Rules that must hold

- **Keys never appear in code, logs, fixtures or screenshots.** RTT's terms: no token in a distributed app, or it's
  revoked. The app ships with none; each user's key stays on their phone (Capacitor Preferences, app-private, Android
  backups off). With no key the app is in **demo mode** (the simulator), clearly bannered.
- **The allowance is tiny:** 10 calls a minute, 100 an hour, 1000 a day on Free and Hobbyist. Every real call goes
  through one `Budget`, which obeys `X-RateLimit-Remaining-*` and `Retry-After`. The last 10 calls of each hour are
  kept for searches: background work never spends them. Running out shows "busy" with the last answer, never "not found".
- **Be plain about limits.** Say when data is simulated, stale, estimated by us, or missing. Never pass our estimate off
  as RTT's forecast. RTT has no signal or berth data: never claim signals.
- **Tests never touch the network.** Unit tests use the simulator or fakes; browser tests fake RTT and GitHub and fail on
  any other request. Fixtures are RTT recordings (`real_*.json`) or spec-derived (`spec_*.json`, with a `_note`).
- **Updates keep users' data** (`test/persistence.test.ts`): never change `appId`, `server.androidScheme`,
  `server.hostname`, the signing key, or a storage name without a migration in the same PR.
- **Nothing personal in tracked files** (`npm run leak-check`, in CI): no owner names, machines, servers, other
  projects, home paths or emails beyond the repo URL (and GitHub's noreply commit address in `scripts/owner.sh`).
  The same check covers commit messages and PR text (`--text` mode, via commit-msg and `history-check.mjs`).

## Product behaviour

- **Board:** departures or arrivals at a station from a time (default now), 60 minutes shown, optional second station
  ("calling at", or "from" for arrivals). RTT charges one call however wide the window, so each call fetches three
  hours (`FETCH_WINDOW`) and every board inside it (now, Later, Earlier back to it) is served from that answer. Rows
  shown: booked in the window, plus earlier ones still running late into it. Kept 1 minute, or 5 for a board an hour or
  more ahead. A "now" board refreshes itself every 2 minutes while on screen for 15 minutes (`BOARD_REFRESH`), then
  waits for Refresh. Empty stock and staff-only rows are hidden unless "show all".
- **Search:** station, Departures or Arrivals, an optional second station (labelled "Calling at" or "Coming from" to
  match), and a folded "Another time or day" (otherwise, now) beside "Find trains". Recent stations are offered in an
  empty station box as soon as it's tapped. The page fits a 360 × 700 app screen with no scrolling, first visit or
  coming back (`test/ui/fit.spec.ts`).
- **Train page:** every location RTT returns. Calls are full rows; passing points fold into one "N passing points" row
  between two stops (tap to open, "Fold away" closes; both survive refreshes). The group the train is in opens by
  itself unless you folded it. Passed stops are filled in. Each
  live time has a circle before it (`components/marks.ts`): **filled** = reported, **ring** = RTT's forecast or own
  estimate ("On time" when it matches), **dashed ring** = our guess. A junction on time shows only its circle.
- **Live position:** between the last reported point and the next, by elapsed time against the working timetable. It
  never passes an unreported point (holds at 95%), says "No report at X yet" 2 minutes after expected, and once
  departed sits at least 26 px clear of the station it left.
- **Our estimate** carries the delay forward and lets a late train win back 75% of booked allowances and dwell over
  30 s, never leaving an advertised stop early. Used only where RTT gives no forecast or gives an impossible one. Not
  backtested: it's a reasoned guess.
- **Polling** (`core/poll.ts`): never more than once a minute; 20 s after the next report is due while running; just
  after departure at a station; shortly before it's due when not started (at least every 3 minutes); every minute when
  overdue; every 2 minutes while your stop is over 40 minutes off. Stops when the train arrives or is cancelled
  (passing your stop doesn't stop it). The allowance's own floor, `3600 / (calls left this hour - 10)`, can only slow
  it. Nothing polls in the background; coming back fetches only if a poll is due. About 45 calls an hour per train.
- **Manual refresh** (`manualMinAge`): refetches an answer over 15 s old while more than 30 calls are left this hour,
  over 60 s with 11 to 30, never with 10 or fewer. Tapping sooner is free. It resets the automatic schedule.
- **Train page bar:** sticks to the top: the answer's age (ticking; "Updating…" during a fetch), a refresh icon that
  spins during any fetch, Jump to train. It sits below the status bar on edge-to-edge phones.
- **Train view** (the train page's second tab, remembered): the same answers drawn as the train in countryside. It
  stands at a platform (under the station's sign) while stopped, accelerates away once the departure is reported,
  runs at one easy speed, crawls while a report is overdue, and brakes onto the next platform when the arrival is in:
  a picture of what RTT reported, not a simulation. Along the bottom: the station it left (or leaves) and when, and
  the next one it's due at, with marks as on the route; passing points don't count as ends. The coaches scroll
  sideways, front first, as long as the train. Coach letters and facility icons show only when RTT sends Know Your
  Train data (most keys don't); otherwise coaches are numbered from the front, and it says so. The sky is dawn, day,
  dusk or night by the sun where the train is (`core/daylight.ts`), each tuned for the light and dark themes.
  Reduced motion: the scene stands still. Layers move by CSS transforms (composited), and it sleeps while standing.
- **Your stop:** a train opened from a board knows where you get on and off: a big "N min", stops away, platform
  (solid plate confirmed, outlined expected).
- **Recent** (`store/recent-trains.ts`): the 30 trains you opened, newest first, one entry per train; the search page
  shows one "Carry on" line for the newest still running (until 30 minutes after it's due in).
- **Settings:** the key folds to one line once it works and opens itself with no key or a problem. Appearance holds
  the train marker (Dot default, Bar, Arrow, Train front). About is the last group. Top bar: Search, Recent, and a cog
  for Settings (named "Settings" for screen readers).
- **Tiers** come from entitlements and reported limits: `allowDetailed` = Hobbyist features, a full-allocation
  entitlement or over 100 an hour = Team or above, nothing = Free.
- **Rounding:** lateness is whole minutes toward zero (railway practice). Only the simulator rounds, halves up.
- **Updates** (`ui/updates.ts`): Settings, or once a day quietly, asks GitHub for the latest release. If newer, one tap
  ("Update now" in the banner, "Update to X" in Settings) downloads the APK, checks its SHA-256 and installs it over this
  version (`UpdaterPlugin`). Android asks once to allow installs and refuses an APK signed with another key.

## UI

The "Platform" look, from British rail signage: warm paper and navy ink (deep navy at night), Barlow and Barlow Semi
Condensed, navy sign plates for platforms, a thick Beck-style line with ringed stops, the train as a yellow marker with
an ink edge, one giant "N min" number. No cards, boxes, glow, gradients or pills: hierarchy comes from type. Two
deliberate exceptions, so each page is known at a glance: a board's station name is a navy nameboard, and Settings
groups its rows in panels, like a phone's settings. CUBE
layers `tokens, base, composition, block, utility, exception`; themes are token-only files. Phone first (412 px and
360 px), 44 px touch targets (links inside sentences excepted), edge to edge with `env(safe-area-inset-*)`. Every text
colour is at least 4.5:1 on what it sits on, in both themes, and the train marker 3:1 (`test/design.test.ts`).

## RTT API essentials

- Only `data.rtt.io` works; the old `api.rtt.io` answers 418. Ignore tutorials using `serviceUid`/`runDate`.
- Auth: `Authorization: Bearer <token>`. Portal tokens are usually refresh tokens: `GET /api/get_access_token` swaps
  one for `{token, entitlements, validUntil}`. `GET /api/info` gives entitlements and version. We pin `Version: 2026-07-25`.
- `GET /gb-nr/location?code=RDG&timeFrom=...&timeWindow=180[&filterTo=PAD|&filterFrom=OXF][&detailed=true]`: a board.
  204 with no body means no services.
- `GET /gb-nr/service?uniqueIdentity=C12345:2026-11-07[&detailed=true]`: one train. `displayAs` `PASS` **or null** is
  a pass, timed in `temporalData.pass`. `allowances` are in seconds.
- Times: `scheduleAdvertised` (public), `scheduleInternal` (working, half minutes), `realtimeActual`,
  `realtimeForecast`, `realtimeEstimate` (RTT's, when no report).

Quirks seen in real answers (never "fix" data to match the spec): times have **no UTC offset** and are UK local
(`query.timeFrom` has one); `query.location.longCodes` are prefixed (`gb-nr:PADTON`), origin/destination ones aren't
and may lack `shortCodes`; `platform.forecast` is populated though the spec says it isn't used; nullable enums omit
null in the spec; `stockType` comes lowercase; detailed actuals are at quarter minutes; detailed boards include empty
stock (`OPERATIONAL_ONLY`, operator `ZZ`) and `BUS` rows; `status` can lag an actual; advertised lateness can be negative.

## How to work on it

### Branches
- One branch per piece of work, from the GitHub repository's `main` as just fetched (`git fetch`, then branch from
  the remote-tracking `main`, never a local `main`, which in an old checkout can be another history), named
  `<type>/<topic>`: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `ci/` or `chore/`, e.g. `fix/board-late-trains`.
  Follow-ups to the same piece of work are more commits on the same branch, never a new one. Rebasing onto `main`
  means onto that freshly fetched remote-tracking `main` too.

### Commits
- Small and logical, each one passing `npm run check` on its own (so history can be bisected). Stage explicit paths,
  never `git add -A`. A short subject saying what changed; a body only when the why isn't obvious.
- Commit with **`npm run commit -- "<subject>" [-m "<body>"] <path>...`** (`scripts/commit.sh`): it refuses if
  anything is already staged, checks the message with the commit-msg hook before anything else, stages exactly those
  paths and commits; if the commit fails, it unstages them again, so nothing is left staged for a push to strand.
- Never an AI co-author trailer or a "Generated with" line. All work is attributed to the owner, under one identity:
  `scripts/owner.sh` (the GitHub login and its noreply address, so no real name reaches public history).
- **Git hooks enforce this** (`scripts/git-hooks/`, switched on by `npm install`). pre-commit refuses any author or
  committer but the owner, lists what's staged (deletions and renames by name) and runs `npm run check` (the leak
  check is part of it) on **the commit itself**: with unstaged or untracked files about, on the staged snapshot in a
  throwaway worktree, so a file the commit leaves out can't make it pass. commit-msg refuses AI attribution
  (`scripts/attribution.re`), personal details (the leak check's `--text` mode) and subjects over 72 characters.
  pre-push refuses while anything is staged (a commit just before it failed), any remote but this repository (a
  checkout may also carry the old one), and any pushed commit that isn't the owner's or whose message fails those
  checks (`scripts/history-check.mjs`). It checks only the branch's own commits, the ones no remote branch has yet,
  so a branch rebased onto a moved `main` pushes (main's commits carry the committer GitHub's merge sets). Tested in `test/git-hooks.test.ts` and `test/history-check.test.ts`. Never
  `--no-verify`: fix what the hook found.
- CI's Checks job runs `history-check.mjs` over the PR's own commits and its title and body (re-run when they're
  edited): hooks can be skipped, and PR text is public the moment it's saved.
- The hook is what makes every commit pass on its own, so there's no second pass over a branch's commits. After a
  rebase onto a `main` that moved, only the branch's head is checked again (CI does it): the commits under it passed
  on the base they were made on, and the PR is the unit that reaches `main`.

### What runs, and when (each once, where it adds something)
| When | What | Why |
|---|---|---|
| Every commit | `npm run check` (the hook) | each commit stands alone |
| Before opening the PR, if anything shows on screen | `npm run test:ui`, then the contact sheet | looks can only be judged locally |
| Opening the PR | CI: Checks and Browser | the one run that counts |
| `main` moved before the merge | rebase, CI again | the only test of the two changes together |
| After the merge | nothing | the tested commits are what `main` gets |
| A release | everything, then the signed build | the APK is built from what's on `main` |

### Definition of done (every PR)
1. **A bug fix starts with a test that fails** because of the bug, then the fix. A feature has tests for what it does.
2. `npm run check` passes (typecheck, unit tests, architecture rules, leak check, build): the hook sees to that. For a
   change you can see, `npm run test:ui` passes locally too; otherwise the PR's Browser job is its run.
3. The test review is clean or explained: nothing new in `npm run review`, or an `accept`/`explain` with a real reason.
4. **For a change people can see, the contact sheet was looked at** (`.ui-report/index.html`), at both sizes. Rules
   can't judge looks.
5. This file is updated if behaviour, structure, a rule or a command changed.
6. The PR description says what changed, why, how it was tested, and what couldn't be (on a real phone, say).

### Pull requests
- **Nothing sits unpushed.** Every branch starts from `main` and is pushed as soon as it has a commit, and again as
  work goes on. A branch push runs no CI (there's no PR yet), so it costs nothing.
- **Side by side, never stacked.** Independent pieces of work are separate branches and move in parallel. Work that
  depends on another piece is folded into that branch, never a branch made from another branch.
- **Open the PR when the definition of done is met** (`gh pr create`): that's its CI run. If `main` moved since the
  branch started (another PR merged), rebase onto `main` first, so that one run is also the run that counts. Pushing
  to an open PR re-runs CI (and cancels the older run), so fix review points in one push. No draft PRs: CI must never
  skip its jobs to save a run, because GitHub counts a skipped required check as passed.
- Its title is the line release notes will show, in plain words.
- CI must pass both required checks, **Checks** and **Browser**, on a branch up to date with `main`. `main` takes no
  direct pushes, force-pushes or merge commits (ruleset "main: PRs and green checks"). Rebasing just before opening
  the PR keeps "up to date" from costing extra runs.
- CI doesn't run again on `main` after a merge: a rebase merge of an up-to-date branch puts exactly the tested commits
  there, and a release runs everything again itself.
- **Agents open PRs; they merge only when the owner says so**, and only with `npm run merge -- <number>`
  (`scripts/merge-pr.sh`, tested with a stand-in `gh` in `test/merge-pr.test.ts`): it refuses unless Checks and
  Browser each ran and passed on the PR's current head (skipped or never reported doesn't count) and the PR's title
  and body pass `history-check.mjs`, then rebase-merges pinned to that commit and deletes the branch. Never `gh pr merge` directly, and
  never in the same step as a push or a check: push, wait for CI, look, then merge. Merging never releases.

### Releases
Releasing is a separate choice. The version lives only in the release tag (`package.json` says `0.0.0-dev`), so there
are no version-bump PRs. Semver: patch for fixes, minor for features.

```sh
gh workflow run release.yml -f version=1.2.3   # or Actions > Release > Run workflow, or push a tag v1.2.3 on main
```

It refuses a version that isn't `X.Y.Z`, is already released, or isn't newer than the latest, and a tag not on `main`.
Then: the tests, a signed APK built as that version (checked with apksigner and aapt2), the tag, and the Release with
the APK and its `.sha256`. Signing reads `LIVELINE_KEYSTORE_FILE/PASSWORD` and `LIVELINE_KEY_ALIAS/PASSWORD` (CI
secrets) or a gitignored `android/keystore.properties`. versionCode is `major*10000 + minor*100 + patch`.

### Writing code
- **One job per unit.** A page is a `Page` subclass; its markup is a pure function in `views/`; markup two views share
  goes in `components/`; DOM behaviour two pages share is a class in `widgets/`; anything stored is a `store/` class
  over `Pref`, its name in `KEYS`.
- **No second copy.** Before writing something, look for it (`grep`); the second time a piece of logic or markup is
  needed, extract it. Test doubles live once, in `test/support.ts`.
- **Tunable numbers are named constants** at the top of their module (`POLL`, `BOARD_REFRESH`, `FETCH_WINDOW`), not
  literals in logic. A comment says why each value is what it is.
- **Types come from their source:** derive a type (`Shown["source"]`) rather than restating it, so a new case is a
  compile error instead of a silent default.
- Comments say why, and stay true: a comment that would mislead after your change gets changed with it.

### Tests
- `test/*.test.ts` (Vitest): logic, with injected clocks and fakes. 10 s hard limit per test: a hang is a bug.
- `test/ui/*.spec.ts` (Playwright): pages and flows in the built app at 360 px light and 412 px dark, at a fixed
  moment on the simulated railway. Every page runs the layout audit (no sideways scroll, nothing clipped, no split sign
  plates, 44 px targets) and goes on the contact sheet.
- **Test review** (`test/harness/review.ts`, state in `.test-review/`): each test's time is kept against its baseline. A
  test clearly slower (over 2x and 100 ms, after allowing for the whole machine being slower) stays queued on every run
  until it recovers three runs running or is accepted: `npm run review -- accept "<id>" --reason "..."`. A test that
  fails then passes on the same code is flaky and stays listed until `npm run review -- explain "<id>" --reason "..."`.
  Never re-run until green. Every failure's message goes to `.test-review/failures.log`. Warnings never fail a run;
  CI keeps no baselines (its machines are thrown away) and prints the slowest tests.
- `test/golden/` is frozen (see its README): a change that alters a golden answer updates it in the same PR and says why.
- Run output goes to a file before you read it (`npm test > out.txt 2>&1`), and you read the real error.

### Commands
```sh
npm ci
npm run dev                     # browser dev server, with the /rtt relay (RTT sends no CORS headers)
npm run check                   # typecheck, unit tests, architecture, leak check, build: before every commit
npm run commit -- "<subject>" <path>...   # commit exactly those paths (scripts/commit.sh); -m "<body>" adds a body
npm run test:ui                 # browser suite, then open .ui-report/index.html
npm run review                  # what's slow or flaky, and how to clear it
npm run readme-pictures         # remake docs/img from the demo after a visible change, then look at them
npm run merge -- <PR number>    # only when the owner says "merge" (scripts/merge-pr.sh)
npm run typecheck; npm test; npm run leak-check; npm run build   # the parts of check, one at a time
npm run android:sync            # build, then copy it into android/ (android:debug, android:release build APKs)
scripts/android-build.sh debug  # an APK locally (JDK 21 and the Android SDK; see the script)
```

## Gotchas

- RTT sends no CORS headers: Android uses Capacitor's native HTTP; a browser build needs the `/rtt` relay, which only
  exists when Vite runs from the repo root with its config (a preview started elsewhere serves `index.html` for `/rtt`).
- Playwright tries routes newest first: register the catch-all before specific routes.
- A full-page screenshot taken while scrolled draws sticky bars where the screen's top was; scroll to the top first.
- Node's type stripping (used by `npm run review`) can't run TypeScript parameter properties: write fields out in
  files Node runs directly.
- The CSP is injected only into production builds (`vite.config.ts`); it allows `api.github.com` for the update check.
