<a href="#readme">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/img/banner-light.png">
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/banner-dark.png">
    <img alt="LiveLine: where your train really is, between stations. A line from London Paddington to Oxford, with the train just past Slough." src="docs/img/banner-light.png" width="100%">
  </picture>
</a>

<p align="center">
  <a href="https://github.com/dusty369289/liveline/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/dusty369289/liveline?style=flat-square&color=1b2a4a&label=release"></a>
  <a href="https://github.com/dusty369289/liveline/actions/workflows/ci.yml"><img alt="Checks" src="https://github.com/dusty369289/liveline/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-1b2a4a?style=flat-square"></a>
  <img alt="Android" src="https://img.shields.io/badge/Android-app-1b2a4a?style=flat-square">
  <img alt="No server" src="https://img.shields.io/badge/server-none-1b2a4a?style=flat-square">
  <img alt="No account" src="https://img.shields.io/badge/account-not_needed-1b2a4a?style=flat-square">
</p>

<p align="center">
  <a href="#install"><b>Install</b></a> &nbsp;·&nbsp;
  <a href="#add-your-realtime-trains-key"><b>Your key</b></a> &nbsp;·&nbsp;
  <a href="#reading-the-train-page"><b>Reading it</b></a> &nbsp;·&nbsp;
  <a href="#how-it-places-the-train"><b>How it works</b></a> &nbsp;·&nbsp;
  <a href="#what-it-cant-do"><b>Limits</b></a> &nbsp;·&nbsp;
  <a href="#developing"><b>Developing</b></a>
</p>

Most train apps know a train is "between Slough and Reading". **LiveLine shows where between.** It follows a train
through every stop *and every timing point it passes* (junctions, and the stations it runs through), with the booked,
reported and expected time at each. Between reports it moves the train along the line at the timetable's pace, and it
holds short of the next point until that point is reported, so a train stuck at a signal looks stuck.

It's an Android app that talks to [Realtime Trains](https://www.realtimetrains.co.uk/) straight from your phone with
your own free key. There's no server and no account, and without a key it runs a clearly marked demo.

<table>
  <tr>
    <th width="25%">Search</th>
    <th width="25%">Pick a train</th>
    <th width="25%">When it leaves</th>
    <th width="25%">Where it is</th>
  </tr>
  <tr>
    <td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/img/search-dark.png"><img alt="The search page: a train to carry on tracking, a saved journey with Return, then station, Departures or Arrivals, and an optional calling-at station." src="docs/img/search-light.png"></picture></td>
    <td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/img/board-dark.png"><img alt="London Paddington's departures from 09:00: each train's time, whether it has left, where it's going, and a platform sign." src="docs/img/board-light.png"></picture></td>
    <td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/img/train-dark.png"><img alt="The 09:00 to Oxford: 42 min until it reaches Oxford, passed Iver 6 minutes late, and why it's delayed." src="docs/img/train-light.png"></picture></td>
    <td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/img/train-line-dark.png"><img alt="The route as a line: passing points with half-minute booked times and reported times, and the yellow train between Iver and Langley." src="docs/img/train-line-light.png"></picture></td>
  </tr>
</table>

<sub>Pictures from the app's demo mode: the trains are simulated, on a real route. Made by <code>npm run readme-pictures</code>.</sub>

| Feature | What it does |
|---|---|
| **Every timing point** | Stops, junctions and through stations, folded into "6 passing points" until you open them. The run the train is on opens by itself |
| **The train on the line** | Placed between its last report and the next, never past a point that hasn't reported |
| **The number you came for** | A big "42 min" until it leaves your stop, or reaches where you get off, with the platform |
| **Honest about what it knows** | A filled circle is reported, a ring is forecast, a dashed ring is the app's own guess. Simulated, stale or missing data says so |
| **Your journeys** | Save a commute once, then it's one tap, and **Return** gives the way home. Recent trains, and "Carry on" for one still running |
| **Gentle on your allowance** | Every call is counted, cached and paced to fit Realtime Trains' free 100 an hour |
| **Updates itself** | One tap downloads the next release, checks it and installs it over this one, keeping your key and journeys |
| **Three themes, light and dark** | **Operator colour** (each train in its operator's colours, the default), **Swiss timetable** or **Quiet**, picked in Settings from a picture of each. All follow your phone's light or dark setting |

## Install

1. On your phone, open the [latest release](https://github.com/dusty369289/liveline/releases/latest) and download the
   `.apk`.
2. Open it. Android asks once to allow installs from your browser: allow it, then install.
3. After that, updates are one tap: **Update now** when a new version is out (it checks once a day), or **Settings >
   Update to X**. The download is checked against its published SHA-256 before it installs.

## Add your Realtime Trains key

1. Sign in at <https://api-portal.rtt.io> (the API portal, not the RTT+ subscriptions page) and request a token. The
   free plan works. The Hobbyist plan (£4 a month) adds detailed mode, which the app uses by itself.
2. In the app, **Settings**: paste the key. It's checked with Realtime Trains (one call) and kept only on your
   phone, in the app's private storage, with backups off. It's never shown again in full.

> [!NOTE]
> Without a key, LiveLine runs a **demo** on two real routes (Paddington to Oxford, Waterloo to Woking) with simulated
> trains, and a banner on every page says so.

## Reading the train page

| You see | It means |
|---|---|
| ● 09:19 | **Reported** by Realtime Trains. To the minute on Free, to the quarter minute with detailed mode |
| ○ 09:23 | Realtime Trains' **forecast**. "On time" when it matches the booking |
| ◌ 09:20 | **Our guess**, only where Realtime Trains gives none (or an impossible one) |
| +7 | Minutes late, counted toward zero as the railway does |
| 09:13½ | A working-timetable time. Passing points are booked to the half minute |
| <kbd>BOARD</kbd> <kbd>ALIGHT</kbd> | Where you get on and off, when you came from a board |
| **3** in a solid plate | Platform confirmed. An outlined plate isn't confirmed yet |

## How it places the train

Realtime Trains reports a train as it passes each timing point. Between two reports LiveLine moves the marker by the
time elapsed against the booked time for that section. It stops at 95% of the way until the next point is reported,
and if that report is 2 minutes overdue it says "No report at Langley yet" rather than pretend.

Where Realtime Trains has no forecast, LiveLine makes its own: it carries the delay forward and lets a late train win
back 75% of the recovery time and long waits in the timetable, but never leave an advertised stop early. It's a
reasoned guess, not a tested model, and it's always drawn as a dashed ring.

## How it spends your allowance

Your key's allowance is 10 calls a minute, 100 an hour and 1000 a day (Free and Hobbyist). Each window rolls: a call
counts against it until it's that old. Every call goes through one budget, which also obeys the limits Realtime
Trains reports with each answer, and any "wait until" it sends.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/allowance-call-dark.png">
  <img alt="Every call to Realtime Trains, drawn as a railway line. The app wants an answer. First junction: is a recent answer kept (a board for 1 minute, or 5 for one an hour ahead)? If yes, it's shown from what's kept, with no call. If not: who's asking? Your searches and taps go straight on. The app's own calls (a train's next poll, a board's own refresh) take a branch through a junction asking whether more than 10 calls are left this hour; if not, they wait, as the hour's last 10 are kept for your searches. Both lines then meet: is a call free this minute, this hour and today, with no 'wait' from Realtime Trains? If yes, it asks Realtime Trains, one call, counted. If not, it shows the last answer, marked old, and says when it can ask again." src="docs/img/allowance-call-light.png">
</picture>

As the hour's calls run down, the app slows itself, so they last the hour:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/allowance-hour-dark.png">
  <img alt="The hour's 100 calls as a line from 100 left to none, the train partway along. Each call leaves the count an hour after it's made, so the train runs back along the line as time passes. From 100 to 30 left: Refresh fetches an answer over 15 seconds old, and polls come when the train next reports, at most once a minute. From 30 to 10: Refresh only for an answer over 60 seconds old, and polls spread over the hour, no sooner than 3600 seconds divided by the calls left minus 10. From 10 to none: searches only; Refresh shows what's on screen, and polls wait for calls to free up. None left: the last answers, marked old, and 'Allowance used up' says when searches work again." src="docs/img/allowance-hour-light.png">
</picture>

<sub>Drawn like the app's route line by <code>npm run readme-pictures</code>, from the rules in <code>src/core/budget.ts</code> and <code>src/core/poll.ts</code>.</sub>

<details>
<summary><b>How often it asks, and what Refresh costs</b></summary>

Realtime Trains allows 10 calls a minute, 100 an hour and 1000 a day on Free and Hobbyist.

- A train page asks just after the next report is due, at most once a minute, and every 2 to 3 minutes while
  nothing is due, or every half hour for a train over 2 hours off. Following one train for an hour costs about 45
  calls. It stops when the train arrives, and never runs in the background.
- **Refresh** gets a new answer only when the one shown is over 15 seconds old, over 60 when the hour is running low,
  and not at all in its last 10 calls. Tapping it again costs nothing.
- A board is one call for six hours, so **Earlier** and **Later** are usually free. A board for now refreshes
  itself every 2 minutes for 15 minutes.
- The last 10 calls of each hour are kept for searches. If the allowance runs out you see the last answer, marked as
  old, never "not found".

</details>

## What it can't do

> [!IMPORTANT]
> **No signals.** Realtime Trains reports timing points, not signals or track sections. Following a train signal by
> signal would need Network Rail's train describer feed, which a phone app can't use on its own.

- **It needs your own key** for real trains. Realtime Trains doesn't allow a key inside a published app.
- **Android only, for now.** The core is platform-free, so iOS or a desktop build could follow.
- **Great Britain's National Rail network.** No Underground, trams or buses (rail replacement buses do show).

## Developing

```sh
npm ci
npm run dev        # the app at localhost:5173, demo trains until you add a key
npm run check      # types, unit tests, architecture rules, leak check, build
npm run test:ui    # every page, 360 and 412 px, light and dark: see .ui-report/
```

TypeScript, Vite and Capacitor, with plain CUBE CSS and no framework. Tests never touch the network: the unit tests
use a simulator and recordings of real Realtime Trains answers, and the browser tests fake every request.
[AGENTS.md](AGENTS.md) explains how it works, the rules the tests enforce, and how changes and releases are made.

## Credits

- Train data: [Realtime Trains](https://www.realtimetrains.co.uk/). LiveLine isn't affiliated with them.
- Station list: [uk-railway-stations](https://github.com/davwheat/uk-railway-stations) by David Wheatley, from
  [Trainline EU](https://github.com/trainline-eu/stations), under the ODbL.
- Typefaces, all under the SIL Open Font License: [Figtree](public/fonts/OFL-figtree.txt) by Erik Kennedy,
  [Inter Tight](public/fonts/OFL-inter-tight.txt) by Rasmus Andersson, and
  [Atkinson Hyperlegible Next](public/fonts/OFL-atkinson-hyperlegible-next.txt) by the Braille Institute.
- Operator colours: Wikipedia's [National Rail colours](https://en.wikipedia.org/wiki/Template:National_Rail_colour),
  and the Elizabeth line's from TfL's own design idiom. Operator names and colours identify the trains; LiveLine isn't
  connected with any operator.
- [MIT licence](LICENSE).
