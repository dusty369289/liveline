## What and why

## How it was tested
- [ ] `cd app && npm test && npm run build`
- [ ] `uv run pytest` and `uv run ruff check .`
- [ ] Golden files re-exported if Python behaviour changed (`uv run python scripts/export_golden.py`)
- [ ] Looked at it at phone width, if it changes a page
- Not tested (say why):

## Keeps user data?
- [ ] No change to `appId`, the WebView origin, the signing key or stored key names (or a migration is included)
