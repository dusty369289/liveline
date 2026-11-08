# Golden files (frozen)

What the original implementation (Python, retired on 2026-11-07) produced for the recordings and fixtures in
`test/fixtures/rtt/`: parsed results, engine timelines at many moments, stop summaries and simulator answers.
`test/parity.test.ts` checks the TypeScript core still produces exactly the same.

They are frozen: nothing regenerates them. A deliberate change to parsing, the engine or the simulator that alters an
answer must update the expected values here in the same PR, with the reason in its description. A golden mismatch is
never "fixed" by regenerating from the new code without saying why the old answer was wrong.

## Changes

- **2026-11-07, the demo's train stock.** The simulator now describes its trains' units, class and (for one pattern)
  coach letters and facilities, for the Train view (`src/core/sim-stock.ts`). The old answers had only a coach count
  there. `test/simulator.test.ts` still compares every service answer exactly, except `allocationData`, where it
  holds the coach count to the golden; the stock itself has its own tests. The file was not regenerated.
- **2026-11-08, stop summaries say when they're the timetable.** A stop summary has a new field, `timetableOnly`, true
  only once the train is given up on (`no-data` or `unreported`). No golden moment is given up on, so
  `test/parity.test.ts` checks it is false there and compares the rest exactly. The file was not regenerated.
- **2026-11-08, a train held past its departure forecast.** The Reading recording (`C42245`) has the train at Reading
  from 15:23 with RTT's forecast away at 15:27, and the old answers at 15:31 to 16:22 still said "due to leave 15:27",
  as RTT's forecast, though that time had gone. That was wrong: the engine now treats a departure forecast at the
  station it stands at like any other stale one, and shows our time, no sooner than now. `test/parity.test.ts` checks
  that departure is ours and no sooner than a minute ago, takes its time into the headline, and compares the rest
  exactly. The file was not regenerated.
