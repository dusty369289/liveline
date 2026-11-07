// What the Train view draws, from the same timeline as the route: whether the train stands at a station, runs, or
// crawls waiting for an overdue report, and the two times along the bottom (left the last station, due at the next).
// Only stations it calls at count as ends: passing points are scenery.
import type { PointView, Shown, Timeline } from "./engine";
import { isCancelled } from "./models";

export type Phase = "stopped" | "running" | "crawling" | "arrived" | "cancelled" | "unknown";

export interface SceneEnd {
  label: string; // "Left Slough", "Leaves Reading, platform 4", "Due at Didcot Parkway", "Arrived at Oxford"
  shown: Shown | null;
}

export interface Scene {
  phase: Phase;
  station: { name: string; platform: string | null } | null; // where it stands, when it does
  left: SceneEnd | null;
  right: SceneEnd | null;
  progress: number; // 0..1 from the left end's time to the right end's, by the clock
  near: string | null; // a station code near the train, for the sky
}

const isCall = (v: PointView) => v.point.kind === "call" && !isCancelled(v.point);
const platform = (v: PointView) => (v.point.platform ? `, platform ${v.point.platform}` : "");

function callBefore(points: PointView[], index: number): PointView | null {
  for (let i = index; i >= 0; i--) if (isCall(points[i])) return points[i];
  return null;
}
function callAfter(points: PointView[], index: number): PointView | null {
  for (let i = index; i < points.length; i++) if (isCall(points[i])) return points[i];
  return null;
}
function nearCode(points: PointView[], index: number): string | null {
  for (let i = Math.min(index, points.length - 1); i >= 0; i--) if (points[i].point.crs) return points[i].point.crs;
  return points.find((v) => v.point.crs)?.point.crs ?? null;
}

const due = (v: PointView | null): SceneEnd | null => (v ? { label: `Due at ${v.point.name}`, shown: v.arrival ?? v.departure } : null);

export function sceneOf(tl: Timeline): Scene {
  const p = tl.position;
  const pts = tl.points;
  const from = p.fromIndex ?? 0;
  let phase: Phase;
  let here: PointView | null = null;
  let left: SceneEnd | null = null;
  let right: SceneEnd | null = null;

  switch (p.state) {
    case "not-started":
    case "at-origin":
    case "at-station": {
      here = p.state === "at-station" ? pts[from] : (callAfter(pts, 0) ?? pts[0]);
      phase = "stopped";
      left = { label: `Leaves ${here.point.name}${platform(here)}`, shown: here.departure };
      right = due(callAfter(pts, here.index + 1));
      break;
    }
    case "running":
    case "overdue": {
      phase = p.state === "running" ? "running" : "crawling";
      const last = callBefore(pts, from);
      left = last ? { label: `Left ${last.point.name}`, shown: last.departure ?? last.arrival } : null;
      right = due(callAfter(pts, from + 1));
      break;
    }
    case "arrived": {
      here = callBefore(pts, pts.length - 1) ?? pts[pts.length - 1];
      phase = "arrived";
      left = { label: `Arrived at ${here.point.name}`, shown: here.arrival };
      break;
    }
    case "cancelled":
      phase = "cancelled";
      left = { label: "Cancelled", shown: null };
      break;
    default:
      phase = "unknown";
  }

  const a = left?.shown?.time ?? null;
  const b = right?.shown?.time ?? null;
  const progress = phase === "arrived" ? 1 : a != null && b != null && b > a ? Math.min(Math.max((tl.now - a) / (b - a), 0), 1) : 0;
  return {
    phase,
    station: here ? { name: here.point.name, platform: here.point.platform } : null,
    left,
    right,
    progress,
    near: nearCode(pts, here?.index ?? from),
  };
}
