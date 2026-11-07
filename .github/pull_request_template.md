## What and why

## How it was tested
- [ ] A bug fix has a test that failed before the fix; a feature has tests for what it does
- [ ] `npm run check` (typecheck, unit tests, architecture rules, leak check, build)
- [ ] `npm run test:ui`, and the contact sheet looked at if anything visible changed
- [ ] `npm run review` shows nothing new, or each item is accepted/explained with a reason
- [ ] AGENTS.md updated if behaviour, structure, a rule or a command changed
- Not tested (say why, e.g. needs a real phone):

## Keeps user data?
- [ ] No change to `appId`, the WebView origin, the signing key or stored names (or a migration is included)
