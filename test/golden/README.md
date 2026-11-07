# Golden files (frozen)

What the original implementation (Python, retired on 2026-11-07) produced for the recordings and fixtures in
`test/fixtures/rtt/`: parsed results, engine timelines at many moments, stop summaries and simulator answers.
`test/parity.test.ts` checks the TypeScript core still produces exactly the same.

They are frozen: nothing regenerates them. A deliberate change to parsing, the engine or the simulator that alters an
answer must update the expected values here in the same PR, with the reason in its description. A golden mismatch is
never "fixed" by regenerating from the new code without saying why the old answer was wrong.
