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
