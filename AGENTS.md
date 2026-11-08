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
               time (UK DST), models, parse, engine (position + estimate), stops (where you get on and off),
               poll (when to ask again), budget, http (Http interface), rtt (client: auth, cache, budget) and
               errors (what it throws), simulator (demo mode) and sim-stock (its trains' units), stations, rail (what the UI calls),
               update (release check), sha256 (synchronous: the simulator's delay profiles, the key's fingerprint),
               keys (core storage names, and the `StoreKey` type),
               and for the Train view: formation (coaches, units, letters, facilities), scene (stopped, running,
               the two ends), motion (how the drawn train moves), daylight (dawn, day, dusk or night)
  platform/    the only Capacitor code: native HTTP, the private key store, app version, the updater plugin bridge
  ui/
    app.ts       the router: a route name -> a Page class; draws it inside the chrome; problem pages
    pages/       one class per page (extends Page): load() data + markup, mount() wiring, dispose() timers
    views/       pure markup functions, data in, Html out (no DOM, no state)
    components/  markup shared by views (chrome, search form, time marks, facility icons, operator badges, a theme's
                 miniature)
    widgets/     DOM behaviour as classes: shared by pages, or split out of one (station suggestions, passing-point
                 folds, tabs, the train page's announcer)
    store/       everything kept on the device: Pref (one stored value), KEYS (every storage name), the lists,
                 appearance (the theme and the train marker)
    updates.ts   the update check, banner and one-tap install
    live-train.ts  the train page while open: polling, folds, the sticky bar
    live-marker.ts the train marker and travelled line, placed every second against the rows as laid out
    route-place.ts where the marker sits between two rows (pure, in pixels)
    train-scene.ts the Train view while showing: slides the scenery, platforms, wheels (art in views/scene-art.ts,
                   views/train-art.ts; colours in public/css/themes/scene.css)
    html.ts, routes.ts, format.ts   the escaping template, hash routes, text formatting
    focus.ts     keeping focus on the same control when markup is drawn again
  data/        bundled station list (ODbL, see its README)
public/css/    CUBE layers; the only raw colours are in themes/ (operator, swiss, quiet; operators.css; scene.css);
               exception/ holds what each theme changes beyond its tokens
android/       Capacitor's Android project (committed), including UpdaterPlugin.java (the install) and ApkDownload.java
               (fetching the APK and checking its SHA-256)
test/          unit tests (*.test.ts), support.ts (shared doubles), fixtures/rtt/ (RTT recordings), fixtures/release/
               (saved apksigner and aapt2 output), golden/ (frozen answers), harness/ (the test review), ui/
               (Playwright: *.spec.ts)
               readme/ (the README's pictures: playwright.readme.config.ts, not part of test:ui)
docs/img/      the README's pictures, light and dark, made by `npm run readme-pictures`
scripts/       git-hooks/ (pre-commit, commit-msg, pre-push), commit.sh (npm run commit), open-pr.sh (npm run pr),
               merge-pr.sh (npm run merge), history-check.mjs (commits and PR text), leak-check.mjs, owner.sh (the one commit identity),
               attribution.re (the AI attribution pattern), review.mjs, android-build.sh, release-check.sh (the
               release's Version job)
.github/       workflows/ (ci.yml, release.yml: checked by test/workflows.test.ts and actionlint), dependabot.yml
```

## Architecture rules (checked by `test/architecture.test.ts`)

- **Layers point inward:** `core` imports only `core`, never touches `document`, `window` or `localStorage`. Only
  `platform` imports Capacitor. The UI reaches the platform through `src/platform/index.ts`.
- **One home for each thing:** network requests only in `platform/` and `core/http.ts`. Storage names only in
  `core/keys.ts` and `ui/store/keys.ts` (any quoted `liveline.`/`rtt.` name, in any case; the key store and `Pref`
  also take only registered names, by type; browser tests seed by them too, through `seedKey` and `KEYS`).
  `localStorage` only through `Pref` (and the platform's browser key
  store). Markup reaches the page only through `html.ts` (`render`, `fragment`), so everything is escaped: no other
  `innerHTML`/`outerHTML` (`=` or `+=`), `insertAdjacentHTML`, `setHTMLUnsafe`, `createContextualFragment` or
  `document.write` (the escaping itself is tested in `test/html.test.ts`). Raw colours only in the theme.
- **Small files:** none over 300 lines, counting the Android shell's own Java (`android/app/src/main/java`). Three
  core files are exempt, each with its reason in the test and a cap near its size, which it fails past; a new
  exemption, or a higher cap, needs a reason a reviewer would accept, not "it grew".
- Clock and transport are injected (`Rail`, `RttClient`, `SimTransport`, `TestReview`), so tests control time and
  never touch the network.

## Rules that must hold

- **Keys never appear in code, logs, fixtures or screenshots.** RTT's terms: no token in a distributed app, or it's
  revoked. The app ships with none; each user's key stays on their phone (Capacitor Preferences, app-private, Android
  backups off). With no key the app is in **demo mode** (the simulator), clearly bannered.
- **The allowance is tiny:** 10 calls a minute, 100 an hour, 1000 a day on Free and Hobbyist. Every real call goes
  through one `Budget`, which obeys `X-RateLimit-Remaining-*` and `Retry-After`. The last 10 calls of each hour are
  kept for searches: background work never spends them. Running out shows the last answer, never "not found"; with
  nothing kept, "Allowance used up" when this key's calls are spent (`AllowanceError`: ours, not RTT's), or "busy" when
  RTT asked us to wait. That page names one wait: its own (Problem pages, below), or the time RTT gave when that is
  later (`BusyError.retryAt`). "Allowance used up" says when searches work again (`Budget.freeAt`, as the oldest
  calls leave the window), and its retry, a background call, waits until 11 calls are free so it can succeed.
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
  more ahead. A "now" board (no time, and no day or today's) refreshes itself every 2 minutes while on screen for 15
  minutes (`BOARD_REFRESH`), then waits for Refresh. Nothing is asked while the app is hidden; coming back refreshes at once if a round was missed.
  Both ask only when the answer on screen is 2 minutes old, so coming back and the next round never both ask. A
  refresh replaces the window line, its links and everything below the header, and only on its own board (an answer
  arriving after you've moved on is dropped). A refresh that fails (busy, refused, offline) keeps the rows on screen
  and says so: "Showing the answer from N min ago. Not updated: <why>". Empty stock and staff-only rows are hidden
  unless "show all". Each row's live cell reads its time as the train page does (the engine's `shownOf`, coloured by
  `delayClass`): "Left/Arr hh:mm" once reported, "Exp hh:mm" for a forecast a minute or more off, early or late (an
  early train is coloured early, not "On time"), "On time" when it matches. With no live time it says "Timetable" until 2 minutes past booked
  (`NO_REPORT_AFTER`), then "No report"; a bus with none says nothing there (the row already says Bus). Arrivals
  say "from" before the origin. The platform plate carries hidden words ("Platform 5, not confirmed, changed"), not an
  aria-label. The platform is a solid plate when confirmed, outlined when only expected; a changed platform adds a
  bar in the train's colour along the plate's foot (either kind) and "Platform changed" in the row's details. The summary line under
  the nameboard ("Departures calling at Oxford · 10:00 to 11:00") links to the search form filled in with this board's
  query, and Back from a board you searched for returns to the form as you filled it. Its controls are few and plain:
  Earlier, Later and the other direction as words, Refresh as an icon, and a star on the nameboard to save a journey.

**Calm pages** (owner, 2026-11-07: the UI felt overstimulating; `test/ui/calm.spec.ts`): the answer first, each fact
said once, few controls in view, small print only where it's wanted. A train's status is the big number, one line
and any delay reason: stops already passed aren't restated, and "lost most time" sits below the route. Its header is
one line of facts; class and units are in the Train view. Explanations (an outlined platform plate) live on About.
- **Search:** station, Departures or Arrivals, an optional second station (labelled "Calling at" or "Coming from" to
  match), and a folded "Another time or day" (otherwise, now) beside "Find trains". Recent stations are offered in an
  empty station box as soon as it's tapped; each station box is an ARIA combobox with a status line saying how many
  match. The page fits a 360 × 700 app screen with no scrolling, first visit or
  coming back (`test/ui/fit.spec.ts`).
- **Train page:** every location RTT returns. Calls are full rows; passing points fold into one "N passing points" row
  between two stops (tap to open, "Fold away" closes; both survive refreshes). The group the train is in opens by
  itself unless you folded it. Passed stops are filled in. Each
  live time has a circle before it (`components/marks.ts`): **filled** = reported, **ring** = RTT's forecast or own
  estimate ("On time" when it matches), **dashed ring** = our guess. A junction on time shows only its circle. A row
  shows the departure, with "arr hh:mm" when the shown arrival is a minute or more earlier; where you get off it shows
  the arrival, as the summary does. The line under a name joins only the parts that apply (platform, "Now ends
  here"/"Now starts here", arr, Request stop, Not for passengers, status) with one dot between; your stop's
  Board/Alight plate stands before them, no dot. A row reads across on one line: the name's first line, the booked
  time, the live time and the ring share it, and what's under them (that line, "+7" under the live time) hangs below
  without pushing anything up; the train marker and travelled line take their place from the rings. A board row's
  time and destination share a baseline too (`test/ui/align.spec.ts`, every theme).
- **Live position:** between the last reported point and the next, by elapsed time against the working timetable. A
  point RTT flags as passed without a report (`realtimeNoReport`) counts as reached, "(not reported)", timed by
  RTT's forecast, unless RTT still gives it an estimate (then it's still ahead); only actuals count for lateness. Our
  reading of that flag is untested against a real answer, so only a report at its end makes a train "arrived": a
  flag there leaves it heading for its end, polled, until the cut-off below says its arrival wasn't reported. It
  never passes an unreported point (holds at 95%), says "No report at X yet" 2 minutes after expected, and once
  departed sits at least 26 px clear of the station it left. When RTT's answer says it has no live data
  (`SCHEDULE_ONLY` or `REALTIME_DATA_NONE`, `feedOf` in `core/models.ts`), a missing report is put down to that,
  never to a signal, and the page says times are the timetable only. The feed's state rides on `ServiceResult.status`,
  beside `Service` (which the goldens pin).
- **Altered trains:** a cancelled arrival or departure at a stop the train still makes (terminated short, or starting
  part way) is left out of the train page and the estimate (`asRun` in `core/engine.ts`); the board still shows the
  row Cancelled, as parse keeps the flag. Boarding where the departure is cancelled, or alighting where the arrival
  is, is "cancelled". Such a stop is labelled "Now ends here" or "Now starts here".
- **Our estimate** carries the delay forward and lets a late train win back 75% of booked allowances and dwell over
  30 s, never leaving an advertised stop early. Used only where RTT gives no forecast or gives an impossible one. Not
  backtested: it's a reasoned guess. Never for a bus or ship (never reported) or a train we've given up on: those
  show the timetable alone, with no countdown (`engine.timetableOnly`).
- **Polling** (`core/poll.ts`): never more than once a minute; 20 s after the next report is due while running; just
  after departure at a station; shortly before it's due when not started (at least every 3 minutes, but every half hour
  while it's over 2 hours off, waking in time to be on the 3-minute beat at 2 hours); every minute when
  overdue; every 3 minutes for a bus or ship, or a train with nothing reported 10 minutes after it was due off (a bus
  or ship says "Buses aren't tracked live" rather than "No reports yet"); every 2 minutes while your stop is over 40
  minutes off. Stops when the train arrives or is cancelled
  (passing your stop doesn't stop it), or once it's 30 minutes (`giveUpAfter`) past the latest time it's expected at
  its end with no report there (`dueAtEnd`: booked, RTT's forecast or estimate, or the last report plus the booked
  running time from there; never our estimate, which now pushes on), so a late train still reporting is followed. Never reported
  at all, it says the times shown are the timetable (`no-data`); reported on the way, it says where it was last
  reported and that its arrival wasn't (`unreported`). Only a fresh answer gives up: an old one served again (RTT
  down, or calls kept back) that looks given up keeps polling, every minute or the allowance's floor, and says it
  couldn't get a new answer (`Rail.service`). The allowance's own floor, `3600 / (calls left this hour - 10)`,
  can only slow it. A failed fetch stretches the wait (`nextWait`), to at most 5 minutes, but never cuts a longer
  planned wait short. Nothing polls in the background; coming back fetches only if a poll is due. About 45 calls an
  hour per train.
- **Manual refresh** (`manualMinAge`): refetches an answer over 15 s old while more than 30 calls are left this hour,
  over 60 s with 11 to 30, never with 10 or fewer. Tapping sooner is free. It resets the automatic schedule, and after
  a give-up, a tap that brings a live answer starts polling again.
- **Train page bar:** sticks to the top: the answer's age (ticking; "Updating…" during a fetch; once polling stops,
  "Finished · updated …" for a train arrived or cancelled, "No reports · updated …" for one given up on), a refresh
  icon that spins during any fetch, Jump to train (hidden while there's no marker to jump to). It sits below the
  status bar on edge-to-edge phones. It holds the page's only live region (`widgets/announcer.ts`, kept through polls; the redrawn part has none): after a poll with news it
  says the headline, plus the big number's line when that line's news changed. News is judged without the countdown
  number and without the headline's clock times and lateness (they move on nearly every poll); "Now", "Due", a
  platform or the hero's clock time moving are news. A tapped refresh with no news says "Updated". A message in place
  of the age ("Saving calls: refresh in 40 s") is short and wraps to two lines; a fuller sentence (an error's detail)
  goes only to that live region.
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
  (solid plate confirmed, outlined expected). From an arrivals board you're meeting it: the board's station is where
  you get off (the count is to it reaching you), and its "from" station, if any, where you get on. Over 3 hours off, the big number is the time instead, and the other
  stop's line drops its "in N min"; within 3 hours both count down, across midnight too, and keep counting between
  polls ("Due" under a minute; `countText`, ticked by `widgets/countdowns.ts`). A train on another day says
  its day once, in the title ("08:05 London Waterloo to Woking · Mon 9 Nov"); a stop's time adds a day only when it
  differs from that (an overnight train's stop after midnight). Where a station comes up twice (a loop, a train that
  reverses), you get on at its first call with a departure and off at the first call with an arrival after that
  (`resolveStops`, `yourStops` in `core/stops.ts`); the page, its Board and Alight tags and the polling all use those
  calls. Once the train is given up on (`no-data`, `unreported`), there's no "N min": your stops, and every row it
  hasn't reached, show the timetable's time and say so (`timetableOnly`), never our estimate. The status then has one
  sentence in ink ("No live time for X. The timetable says it was due to leave at 07:52.") and the headline, with no
  line per stop repeating them.
- **Problem pages** (`ProblemPage`): a page that couldn't load says why. Busy or offline tries again by itself after
  30 s, doubling after each failure on the same route up to 5 minutes (`PROBLEM_RETRY`), or at the time RTT gave
  if that is later (measured by the rail clock), only while on screen
  (coming back after the time it said tries at once), and as a background call, so it never spends the search
  reserve. A key refusal is kept and shown in Settings; a busy or offline key check isn't, and the next call tries again.
- **Recent** (`store/recent-trains.ts`): the 30 trains you opened, newest first, one entry per train; the search page
  shows one "Carry on" line for the newest still running (from 30 minutes before it sets off until 30 minutes after
  it's due in), under its heading and above My journeys, so a screen reader starting at the focused heading meets
  both. Until a train sets off, Recent says when it leaves ("Leaves 08:05", or "Runs Mon 9 Nov, 08:05" for another
  day), never "Running now", even in that first half hour.
- **Page changes** (`ui/app.ts`): the old page keeps running until the new one is drawn; meanwhile the root has
  `aria-busy` and `is-navigating` (a thin still line along the top after 300 ms). `render` never throws: a
  Realtime Trains error gets its problem page; anything else is logged to the console and shown as "Something went
  wrong" with Try again. A page whose `mount()` fails stays, with a message in the flash. A key that can't be read on
  launch leaves demo mode on. Messages for the next page (`ctx.flash`, after saving a key, say) go in one persistent
  live region in the chrome (`data-flash`), so screen readers hear them. Focus (`ui/focus.ts`): a new page focuses
  its `h1`; the same page drawn again, a train poll or a board refresh puts focus back on the same control (by id,
  name, `data-*` or href). The skip link focuses `main` rather than following `#main`.
- **Settings:** the key folds to one line once it works and opens itself with no key or a problem. Appearance holds
  the theme (a miniature of each, the choice applied at once without drawing the page again) and the train marker
  (Dot default, Bar, Arrow, Train front). About is the last group. Top bar: Search, Recent, and a cog
  for Settings (named "Settings" for screen readers).
- **Android shell** (`platform/index.ts`, started in `main.ts`): Back goes to the previous page, and from the first
  page leaves the app (minimised, as other apps do), which also lets predictive back work. Both system bars
  follow the phone's theme, including a day/night switch while the app is open: under the status bar is a fixed strip
  its height in the top bar's colour (`body::before`, in `--bar`), whatever the page is scrolled to, and every theme's
  top bar is light by day and dark at night. Before the page draws, the window is the default theme's page colour. The CSS reads the status bar's height once, as `--inset-top`
  (`test/design.test.ts`), so the browser tests stand in for a phone by setting it.
- **Tiers** come from entitlements and reported limits: `allowDetailed` = Hobbyist features, a full-allocation
  entitlement or over 100 an hour = Team or above, nothing = Free.
- **Rounding:** lateness is whole minutes toward zero (railway practice), shown against the public time where there is
  one, so the headline and the row agree; the estimate works on the working timetable. Only the simulator rounds,
  halves up.
- **Updates** (`ui/updates.ts`): Settings, or once a day quietly, asks GitHub for the latest release. If newer, one tap
  ("Update now" in the banner, "Update to X" in Settings) downloads the APK, checks its SHA-256 and installs it over this
  version (`UpdaterPlugin`; the check is `ApkDownload`, which deletes a download that doesn't match). Android asks
  once to allow installs and refuses an APK signed with another key. Installing closes the app and Android doesn't
  reopen it, so the installing step says to open it again from the home screen. Its
  "Update this app?" dialog opens only while LiveLine is on screen (or when you come back to it). While it's awaited,
  Update stays tappable ("Open Android's update dialog" in the banner) and reopens it if it was closed; the earlier
  plugin call then ends with `REPLACED`, which the page ignores. The downloaded APK is deleted once the install ends.
  Today's answer is restored before the first page is drawn; a new answer or an install error redraws only the banner
  (`data-banner-slot`), or the whole page on Settings, so a half-typed search survives it.

## UI

Three themes, picked in Settings > Appearance from a miniature of each (`components/theme-preview.ts`), each with a
light and a dark set that follow the phone (owner, 2026-11-08; mock-ups in `notes/prototypes/overhaul`):
- **Operator colour** (`operator`, the default): a grey page, white panels with round corners (board rows, the
  train's status and route, journeys), Figtree, a yellow main button and train. Each board row has its operator's
  badge in place of its name (the name stays for screen readers), and a train page's header wears its operator's
  colour. Badges and colours: `components/operators.ts` (the operators' real short forms, or the brand as written;
  LM split into LNR and WMR by name; no badge rather than a guess) and `themes/operators.css` (Wikipedia's National
  Rail colours, TfL's for the Elizabeth line; white or black text, whichever reads; `test/operators.test.ts`).
- **Swiss timetable** (`swiss`): white, black and one red, square corners, Inter Tight, rules instead of boxes, the
  station name huge and heavy.
- **Quiet** (`quiet`): soft paper, Atkinson Hyperlegible Next, a thin line, light figures and one big thin number.

All three keep the same pages, content and layout: a theme changes colour, type, shapes and spacing only. Each is
tokens on its own `[data-theme]` (`themes/*.css`, not `:root`, so a miniature in Settings can wear it), set on `<html>`
by `store/appearance.ts` (`liveline.theme`); what a theme changes beyond tokens is in `exception/<theme>.css`, under
`:root[data-theme]`, so the miniatures never pick it up. Every theme shares a thick line with ringed stops, the train
as a marker with an edge, one giant "N min" number, and sign plates for platforms. CUBE
layers `tokens, base, composition, block, utility, exception`; themes are token-only files. Phone first (412 px and
360 px), 44 px touch targets (links inside sentences excepted; a link that is a whole line is a control and isn't), edge to edge with `env(safe-area-inset-*)`. A new
page opens at the top; redrawing the same page keeps its place. Every text
colour is at least 4.5:1 on what it sits on, in every theme, light and dark, and the train marker 3:1
(`test/design.test.ts`, which also works out the cascade for the board's platform plate); `test/ui/themes.spec.ts`
lays out every main page in each theme. Text grows with the phone's text size: content sets
heights and text wraps rather than ending in "…". Where a row can't fit at large text, container queries (whose rem
follows the root text size, unlike a media query's) stack it: board rows and route times go under the name, and the
top bar's nav takes a line of its own. Checked at 200%: the board, the Route tab, the Train view and the train bar.

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
  throwaway worktree, so a file the commit leaves out can't make it pass. An amend with no file changes (a reword,
  or resetting the author) is let through after the identity check, and its tree, already committed, isn't checked
  again. A wrong author on a branch is repaired with
  `git rebase --exec "git commit --amend --no-edit --reset-author" liveline/main`. commit-msg refuses AI attribution
  (`scripts/attribution.re`), personal details (the leak check's `--text` mode) and subjects over 72 characters.
  pre-push refuses while anything is staged (a commit just before it failed), any remote but this repository (a
  checkout may also carry the old one), and any pushed commit that isn't the owner's or whose message fails those
  checks (`scripts/history-check.mjs`). It checks only the branch's own commits, the ones no remote branch has yet,
  so a branch rebased onto a moved `main` pushes (main's commits carry the committer GitHub's merge sets). Tested in
  `test/git-hooks.test.ts` and `test/history-check.test.ts`. Never `--no-verify`: fix what the hook found.
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
- **Open the PR when the definition of done is met**, with
  **`npm run pr -- --title "<title>" --body-file <file.md>`** (`scripts/open-pr.sh`, tested with a stand-in `gh` in
  `test/open-pr.test.ts`): it runs `history-check.mjs` on the title and body first, because PR text is public the
  moment it's saved, then `gh pr create` against `main` with that same file. It refuses `--body`, `--draft` and
  `--fill`. Before a `gh pr edit` of the title or body, check the new text the same way:
  `PR_TITLE="..." PR_BODY="$(cat file.md)" node scripts/history-check.mjs`. Opening the PR is its CI run. If `main`
  moved since the branch started (another PR merged), rebase onto `main` first, so that one run is also the run that
  counts: `npm run pr` fetches `main` and refuses a branch that isn't on top of it ("rebase onto main first") or whose
  pushed copy isn't this commit ("push first"). Pushing
  to an open PR re-runs CI (and cancels the older run), so fix review points in one push. No draft PRs: CI must never
  skip its jobs to save a run, because GitHub counts a skipped required check as passed.
- Its title is the line release notes will show, in plain words. The notes are shown in Settings, so they're for users:
  `.github/release.yml` leaves out PRs labelled `process` (merging labels `chore/`, `ci/`, `test/`, `docs/` and
  `refactor/` branches so) and Dependabot's.
- CI must pass both required checks, **Checks** and **Browser**, on a branch up to date with `main`. `main` takes no
  direct pushes, force-pushes or merge commits (ruleset "main: PRs and green checks"). Rebasing just before opening
  the PR keeps "up to date" from costing extra runs.
- CI doesn't run again on `main` after a merge: a rebase merge of an up-to-date branch puts exactly the tested commits
  there, and a release runs everything again itself.
- **Agents open PRs; they merge only when the owner says so**, and only with `npm run merge -- <number>`
  (`scripts/merge-pr.sh`, tested with a stand-in `gh` in `test/merge-pr.test.ts`): it refuses unless Checks and
  Browser each ran and passed on the PR's current head (skipped or never reported doesn't count) and the PR's title
  and body pass `history-check.mjs`, labels process work (`chore/`, `ci/`, `test/`, `docs/`, `refactor/`) `process`
  so release notes leave it out (`.github/release.yml`), then rebase-merges pinned to that commit and deletes the
  branch. Never `gh pr merge` directly, and
  never in the same step as a push or a check: push, wait for CI, look, then merge. Merging never releases.

### Releases
Releasing is a separate choice. The version lives only in the release tag (`package.json` says `0.0.0-dev`), so there
are no version-bump PRs. Semver: patch for fixes, minor for features.

```sh
gh workflow run release.yml -f version=1.2.3   # or Actions > Release > Run workflow, or push a tag v1.2.3 on main
```

The Version job (`scripts/release-check.sh`, tested in `test/release-check.test.ts`) refuses a run that isn't from
`main` (Run workflow on any other branch, even at a commit that's on `main`), a commit not on `main` however the run
started, a version that isn't `X.Y.Z` (no leading zeros), has a minor or patch over 99 (versionCode is
`major*10000 + minor*100 + patch`, so 0.1.100 would collide with 0.2.0), is already released, or isn't newer than the
latest. Then:
1. **Tests**: the whole of `ci.yml` again.
2. **Unsigned APK**: `npm ci --ignore-scripts` and Gradle build it as that version, with no secrets and read-only
   access (npm and Gradle run code from hundreds of packages). `android/app/build.gradle` signs only when
   `LIVELINE_*` or a gitignored `android/keystore.properties` is there, so this build comes out unsigned. It's handed on
   as an artifact.
3. **Sign and publish**, the only job that sees the key or may write: no checkout, no npm, no Gradle, only the
   Android SDK's tools. It zipaligns and signs with `apksigner` (passwords from the environment, never a command
   line), then checks the result: signed by exactly one certificate whose SHA-256 is `SIGNER_SHA256` in release.yml
   (the release key's, from v0.1.0), and `aapt2` shows `dev.liveline.app` with this versionName and versionCode. Then
   the tag and the Release with the APK and its `.sha256`.

`test/workflows.test.ts` pins this shape (who holds secrets, who can write, what the sign job runs) and runs the
signer check against saved apksigner output. Actions are pinned to commits with their version beside them. The Gradle
wrapper jar is checked against Gradle's published checksums (Checks job) and the distribution it downloads is pinned
by `distributionSha256Sum`.
**What protects users:** Android installs an update only if it's signed with the same key as the app already on the
phone, so the key (and the certificate check that every release carries it) is the guarantee of authenticity. The
`.sha256` the app checks guards only against a corrupt download: anyone who could swap the APK could swap it too.

**Dependabot** (`.github/dependabot.yml`) proposes npm, Gradle and Actions updates monthly, a week after each version
is published. Its PRs follow the same rules as any other: both required checks, and a merge only when the owner says
so. Release notes leave out PRs labelled `process` (`.github/release.yml`; `npm run merge` adds the label). One
exemption, for a PR whose author GitHub reports as `dependabot[bot]` (CI passes it as `PR_AUTHOR`; `gh`, which
`npm run merge` asks, says `app/dependabot` with `is_bot` true, and the script maps that back): `history-check.mjs`
expects its commits authored by `dependabot[bot]` and committed by GitHub instead of the owner, and skips the PR body,
the upstream changelog with its contributors' mentions and trailers. Commit messages and the title are still checked
for attribution and personal details.

### Writing code
- **One job per unit.** A page is a `Page` subclass; its markup is a pure function in `views/`; markup two views share
  goes in `components/`; DOM behaviour two pages share is a class in `widgets/`; anything stored is a `store/` class
  over `Pref`, its name in `KEYS`.
- **No second copy.** Before writing something, look for it (`grep`); the second time a piece of logic or markup is
  needed, extract it. Test doubles live once, in `test/support.ts` (the git scripts' throwaway repository in
  `test/repo-support.ts`).
- **Tunable numbers are named constants** at the top of their module (`POLL`, `BOARD_REFRESH`, `FETCH_WINDOW`), not
  literals in logic. A comment says why each value is what it is.
- **Types come from their source:** derive a type (`Shown["source"]`) rather than restating it, so a new case is a
  compile error instead of a silent default.
- Comments say why, and stay true: a comment that would mislead after your change gets changed with it.

### Tests
- `test/*.test.ts` (Vitest): logic, with injected clocks and fakes. 10 s hard limit per test: a hang is a bug. A page's
  wiring (timers, what a refresh swaps) is tested without a browser through `FakeDocument` and `FakeElement` in
  `test/support.ts` (`test/board-page.test.ts`); parsed markup is searched by `[attribute]`, so a test sees only what
  that element really wraps. A test of the app shell itself (`test/app.test.ts`) runs in a DOM (happy-dom,
  `// @vitest-environment happy-dom` at its top) on the simulator; the browser suite remains the judge of what's on
  screen.
- `test/ui/*.spec.ts` (Playwright): pages and flows in the built app at 360 px light and 412 px dark, at a fixed
  moment on the simulated railway. Every page runs the layout audit (no sideways scroll or anything past the screen's
  edge, measured against the viewport Playwright set, as innerWidth grows with wide content; nothing clipped, no split sign
  plates, 44 px targets) and goes on the contact sheet. `keyed.spec.ts` runs with a dummy key against faked RTT
  answers (a recording, at the time it was made) and counts the calls a page makes; a check that nothing more was
  asked waits a moment of real time first, as a call a round starts is asynchronous. What only happens with a key (a
  failed refresh, the search reserve) runs against a fake RTT that answers from the simulator and fails on cue
  (`train-bar.spec.ts`). `keyedRtt` (`test/ui/support.ts`) gives the app a made-up key answered by the simulator, to
  run the keyed paths and count the calls a page makes (`calls.spec.ts`).
- `android/app/src/test/` (JUnit, plain JVM): the Android code's pure parts, such as `ApkDownload`, the checksum check
  that decides whether an update is installed. `npm run android:test` runs them; so does the Checks job (JDK 21).
- **Test review** (`test/harness/review.ts`, state in `.test-review/`): both suites feed it, Vitest through
  `review-reporter.ts` and Playwright through `review-playwright.ts` (browser ids are `file > project > title`; a
  timeout counts as a failure). Each test's time is kept against its baseline. A
  test clearly slower (over 2x and 100 ms, after allowing for the whole machine being slower) stays queued on every run
  until it recovers three runs running or is accepted: `npm run review -- accept "<id>" --reason "..."`. A test that
  fails then passes on the same code is flaky and stays listed until `npm run review -- explain "<id>" --reason "..."`.
  Never re-run until green. Every failure's message goes to `.test-review/failures.log`. Warnings never fail a run;
  CI keeps no baselines (its machines are thrown away) and prints the slowest tests. `TEST_REVIEW_DIR` moves the
  folder: pre-commit's snapshot check sets it to the real checkout's `.test-review/`, so nothing is lost with the
  throwaway worktree.
- The engine's rules each have a named test (`test/engine.test.ts`, run with the default and another `EngineConfig`),
  and `test/engine-sweep.test.ts` checks its promises for every demo train over a simulated morning. The goldens
  only say that something changed; these say which rule. `fakeService` in `test/support.ts` makes small RTT answers.
- `test/golden/` is frozen (see its README): a change that alters a golden answer updates it in the same PR and says why.
- Run output goes to a file before you read it (`npm test > out.txt 2>&1`), and you read the real error.

### Commands
```sh
npm ci
npm run dev                     # browser dev server, with the /rtt relay (RTT sends no CORS headers)
npm run check                   # the pre-commit hook runs this on every commit; run it alone only to see failures sooner
npm run commit -- "<subject>" <path>...   # commit exactly those paths (scripts/commit.sh); -m "<body>" adds a body
npm run test:ui                 # browser suite, then open .ui-report/index.html
npm run review                  # what's slow or flaky, and how to clear it
npm run readme-pictures         # remake docs/img from the demo after a visible change, then look at them
npm run pr -- --title "<title>" --body-file <file.md>   # open the PR, its text checked first (scripts/open-pr.sh)
npm run merge -- <PR number>    # only when the owner says "merge" (scripts/merge-pr.sh)
npm run typecheck; npm test; npm run leak-check; npm run build   # the parts of check, one at a time
npm run android:sync            # build, then copy it into android/ (android:debug, android:release build APKs)
scripts/android-build.sh debug  # an APK locally (JDK 21 and the Android SDK; see the script)
npm run android:test            # the Android JUnit tests (JDK 21 on JAVA_HOME, the Android SDK)
```

## Gotchas

- RTT sends no CORS headers: Android uses Capacitor's native HTTP; a browser build needs the `/rtt` relay, which only
  exists when Vite runs from the repo root with its config (a preview started elsewhere serves `index.html` for `/rtt`).
- Playwright tries routes newest first: register the catch-all before specific routes.
- A full-page screenshot taken while scrolled draws sticky bars where the screen's top was; scroll to the top first.
- Node's type stripping (used by `npm run review`) can't run TypeScript parameter properties: write fields out in
  files Node runs directly.
- The CSP is injected only into production builds (`vite.config.ts`); it allows `api.github.com` for the update check.
