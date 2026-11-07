"""Write golden outputs from the Python reference for the TypeScript port to match (app/test/golden/*.json).

    uv run python scripts/export_golden.py

For every RTT fixture (spec-derived and real recordings): the parsed service or board, and for services the engine
timeline at several moments. Also simulator answers at fixed moments, so the TypeScript simulator can be held to the
same output. Times are epoch milliseconds, matching app/src/core/time.ts.
"""

from __future__ import annotations

import json
import sys
from dataclasses import fields, is_dataclass
from datetime import date, datetime, timedelta
from enum import Enum
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from liveline.domain.engine import build, stop_summary  # noqa: E402
from liveline.domain.parse import parse_board, parse_service  # noqa: E402
from liveline.sources.simulator import SimTransport  # noqa: E402

LONDON = ZoneInfo("Europe/London")
FIX = ROOT / "tests/fixtures/rtt"
OUT = ROOT / "app/test/golden"


def camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(w.capitalize() for w in rest)


RENAMES = {
    "no_report": "noReport",
    "passing": "passing",
    "ours_arrival": "oursArrival",
    "ours_departure": "oursDeparture",
}


def to_json(o):
    if o is None or isinstance(o, (bool, int, float, str)):
        return o
    if isinstance(o, datetime):
        return int(o.timestamp() * 1000)
    if isinstance(o, date):
        return o.isoformat()
    if isinstance(o, timedelta):
        return int(o.total_seconds() * 1000)
    if isinstance(o, Enum):
        return o.value
    if isinstance(o, (list, tuple)):
        return [to_json(x) for x in o]
    if isinstance(o, dict):
        return {str(k): to_json(v) for k, v in o.items()}
    if is_dataclass(o):
        return {camel(f.name): to_json(getattr(o, f.name)) for f in fields(o)}
    raise TypeError(type(o))


def timeline_json(tl):
    d = to_json(tl)
    d.pop("service", None)
    for v in d["points"]:
        v.pop("point", None)  # the parsed service is checked separately
    return d


def moments(svc):
    """Instants spread over the service's run, so every engine state gets exercised."""
    ts = [t for p in svc.points for t in (p.arrival.planned, p.departure.planned, p.passing.planned) if t]
    if not ts:
        return []
    a, b = min(ts), max(ts)
    span = b - a
    out = [a - timedelta(minutes=20)] + [a + span * k / 8 for k in range(9)] + [b + timedelta(minutes=30)]
    return [t.replace(microsecond=0) for t in out]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cases = []
    for path in sorted(FIX.glob("*.json")):
        body = json.loads(path.read_text())
        if "service" in body:
            svc = parse_service(body)
            tls = []
            for t in moments(svc):
                tl = build(svc, t)
                codes = [p.crs for p in svc.points if p.crs][:2] + [p.crs for p in svc.points if p.crs][-1:]
                tls.append(
                    {
                        "now": to_json(t),
                        "timeline": timeline_json(tl),
                        "stops": {c: to_json(stop_summary(tl, c)) for c in codes}
                        | {f"{c}:off": to_json(stop_summary(tl, c, boarding=False)) for c in codes},
                    }
                )
            cases.append({"file": path.name, "kind": "service", "parsed": to_json(svc), "timelines": tls})
        else:
            t0 = datetime(2026, 1, 1, tzinfo=LONDON)
            board = parse_board(body, fallback_name="Fallback", time_from=t0, time_to=t0 + timedelta(hours=1))
            cases.append({"file": path.name, "kind": "board", "parsed": to_json(board)})
    (OUT / "fixtures.json").write_text(json.dumps(cases, indent=None, separators=(",", ":")) + "\n")

    sims = []
    for when in (
        datetime(2026, 11, 7, 6, 40, tzinfo=LONDON),
        datetime(2026, 11, 7, 14, 20, tzinfo=LONDON),
        datetime(2026, 7, 6, 17, 55, tzinfo=LONDON),
    ):
        sim = SimTransport(clock=lambda w=when: w)
        rec = {"now": to_json(when), "boards": {}, "services": {}}
        for code in ("RDG", "PAD", "WAT", "CLJ"):
            r = sim.get(
                "/gb-nr/location",
                {"code": code, "timeFrom": when.strftime("%Y-%m-%dT%H:%M:%S"), "timeWindow": "90"},
                None,
            )
            rec["boards"][code] = {"status": r.status, "body": r.body}
        for s in sim.tt.day(when.date())[::23]:
            uid = f"{s.identity}:{s.run_date.isoformat()}"
            r = sim.get("/gb-nr/service", {"uniqueIdentity": uid}, None)
            rec["services"][uid] = {"status": r.status, "body": r.body, "profile": s.profile}
        sims.append(rec)
    (OUT / "simulator.json").write_text(json.dumps(sims, separators=(",", ":")) + "\n")
    print(f"wrote {len(cases)} fixture cases, {len(sims)} simulator moments to {OUT}")


if __name__ == "__main__":
    main()
