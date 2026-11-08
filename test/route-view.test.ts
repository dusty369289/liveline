// The route's rows agree with the summary above them: where you get off, the row shows the arrival (the time the
// summary says), and a stop with any dwell says when the train arrives as well as when it leaves.
import { describe, expect, it } from "vitest";
import { build, stopSummary, type Timeline } from "../src/core/engine";
import { formationFor, parseFormations } from "../src/core/formation";
import { parseService } from "../src/core/parse";
import type { ServiceResult } from "../src/core/rail";
import { fromLondon, hm } from "../src/core/time";
import { liveRegion } from "../src/ui/views/live-region";
import { fixture } from "./support";

// A real recording: Gatwick Airport to Reading. Guildford (GLD) is booked 14:41 in, 14:42 out, a one-minute dwell.
const BODY = fixture("real_service_C42388_20261107-1526.json");
const NOW = fromLondon(2026, 11, 7, 15, 26);
const tl: Timeline = build(parseService(BODY, () => NOW), NOW);

function region(at: string, to: string): string {
  const res: ServiceResult = {
    timeline: tl, formation: formationFor(parseFormations(BODY, null), null),
    fetched: { body: BODY, fetchedAt: NOW, stale: false, note: null }, refreshAfter: null,
  };
  return liveRegion(res, at, to, stopSummary(tl, at), stopSummary(tl, to, false)).value;
}

/** One route row's markup, by its point's index. */
const row = (out: string, index: number) => out.match(new RegExp(`<li class="route__pt[^"]*" data-index="${index}"[\\s\\S]*?</li>`))?.[0] ?? "";
const booked = (r: string) => r.match(/<span class="route__booked[^"]*">([^<]*)</)?.[1];
const meta = (r: string) => r.match(/<span class="route__meta">([\s\S]*?)<\/span>\s*<\/span>/)?.[1].replace(/<[^>]+>/g, "") ?? "";

describe("the route", () => {
  it("shows the arrival on the row where you get off, as the summary does", () => {
    const off = stopSummary(tl, "GLD", false)!;
    expect(off.shown?.booked).not.toBe(stopSummary(tl, "GLD")!.shown?.booked); // the dwell makes them differ
    expect(booked(row(region("RDH", "GLD"), off.index))).toBe(hm(off.shown!.booked));
  });

  it("says when a train arrives at a stop it waits at, even for a minute", () => {
    const v = tl.points.find((p) => p.point.kind === "call" && p.arrival?.time != null && p.departure?.time != null
      && p.departure.time - p.arrival.time >= 60_000 && p.departure.time - p.arrival.time < 120_000)!;
    expect(v).toBeTruthy();
    expect(meta(row(region("", ""), v.index))).toContain(`arr ${hm(v.arrival!.time)}`);
  });

  it("doesn't repeat the time at a stop with no dwell", () => {
    const v = tl.points.find((p) => p.point.kind === "call" && p.arrival?.time != null && p.departure?.time != null
      && Math.abs(p.departure.time - p.arrival.time) < 60_000)!;
    expect(v).toBeTruthy();
    expect(meta(row(region("", ""), v.index))).not.toContain("arr ");
  });
});
