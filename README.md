# LiveLine

Where your train really is, between stations.

Type a station and a time, pick a train, and see its whole run. That includes every stop **and every timing point it
passes through** (junctions and the stations it runs past), with the booked, reported and expected time at each one. A
yellow train-front panel shows where the train is *now*. Between reports it moves along the line at the booked speed for
that section, and it holds short of the next point until that point is reported. A train held at a signal therefore
shows as held, not as if it had arrived.

It's built on the [Realtime Trains](https://www.realtimetrains.co.uk/) API. RTT records every timing point, not only
stations, so the train's position can be shown more precisely than in apps that only know about stations.

- An **Android app**. It talks to Realtime Trains straight from your phone with your own key. There's no server in
  between, and no account.
- Works without a key in **demo mode**, with simulated trains on two real routes.
- Free-tier friendly: calls are cached and paced to fit 100 an hour.

## Install

1. On your phone, open the [latest release](https://github.com/dusty369289/liveline/releases/latest) and download the
   `.apk`.
2. Open it. Android asks once to allow installs from your browser. Allow it, then install.
3. Updates: **Settings > Check for updates** (it also checks once a day). It opens the new APK's download, which installs
   over the old one and keeps your settings.

## Add your Realtime Trains key

1. Sign in at <https://api-portal.rtt.io> (the API portal, not the RTT+ subscriptions page) and request a token. The free
   plan works. The Hobbyist plan (£4 a month) adds detailed mode, which the app uses automatically.
2. In the app, **Settings**: paste the key. It's checked with RTT (1 or 2 calls) and kept on your phone only, in the
   app's private storage, with backups off. It's never shown again in full.

## Daily use

1. Search your commute with "Calling at", then **Save this journey**. From then on it's one tap, and **Return** gives
   the way home.
2. Tap your train. The big number counts down to your departure, and the yellow panel shows the train on the line,
   junction by junction. If you leave and come back, it catches up at once, and the home screen offers "Carry on tracking".

## How often it updates, and what refresh costs

Realtime Trains allows 10 calls a minute and 100 an hour on Free and Hobbyist.
- A train page asks again every 40 s or so (`3600 / (calls left this hour - 10)`, never under 30 s), slows down when
  the hour runs low, and stops while the app is in the background.
- **Refresh** gets a new answer only if the current one is over 15 s old. Pressing it again and again costs nothing.
- Boards are kept for a minute. The last 10 calls of each hour are kept for searches, never spent on background updates.
- If the allowance runs out, you see the last answer marked as stale, or a "busy" page that retries by itself. Never
  "not found".

## Plans

| | Free | Hobbyist (£4/month) | Team and up |
|---|---|---|---|
| Live times | to the minute | **to the quarter minute** (berth steps) | same |
| Passing points and the train between stations | yes | yes, more precise | same |
| Headcodes, unit numbers and class, branding | | yes | yes |
| Empty stock and staff-only moves (off by default) | | yes | yes |
| Update interval | about 40 s | about 40 s | faster, from the bigger allowance |

## Reading the train page

| You see | It means |
|---|---|
| **14:41** in bold | Reported by RTT: to the minute on Free, to the quarter minute (14:41¼) with detailed mode. |
| 14:41 | RTT's forecast. |
| *14:41* <sup>est</sup> in grey italic | Our estimate, where RTT gives none. It carries the delay forward, lets a late train win back booked recovery time, and never leaves a stop early. |
| small grey rows | Timing points it passes without stopping. Their booked times are working-timetable times, which can be on the half minute (½). |
| yellow panel | Where we think the train is now (it's the front of a train). |
| +3 / −1 | Minutes late / early. |

**What it can't show:** signals. RTT's API only gives timing points, not signals or track sections. Signal-level
tracking would need Network Rail's own train describer feed.

## Try it in a browser

```sh
npm ci
npm run dev        # http://localhost:5173, demo trains until you add a key in Settings
```

## Development

[AGENTS.md](AGENTS.md) explains how it works, how changes are made and tested, and how releases are published.

## Credits

- Train data: [Realtime Trains](https://www.realtimetrains.co.uk/). Not affiliated. API spec in `docs/rtt-openapi.yml` (MIT).
- Station list: [uk-railway-stations](https://github.com/davwheat/uk-railway-stations) by David Wheatley, from
  [Trainline EU](https://github.com/trainline-eu/stations), ODbL.
- Typeface: Barlow and Barlow Semi Condensed by Jeremy Tribby, SIL Open Font License.
