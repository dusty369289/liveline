// How a train is made up, for drawing it: its coaches, front first, grouped into units. Coach letters and facilities
// come only from RTT's Know Your Train data, which needs an entitlement most keys don't have; without it a coach is
// just a coach. Nothing here is made up, except a coach count when RTT gives none, and that says so (countKnown).
import { isObj, obj, str } from "./parse";

export interface Coach {
  letter: string | null;
  facilities: string[]; // lowercase, as RTT names them: wifi, toilet, first, quiet, bicycle, wheelchair, buffet...
  unit: number; // which unit it's in, counting from the front: a coupling is drawn where this changes
  passenger: boolean;
}

export interface Formation {
  coaches: Coach[];
  facilities: string[]; // common to the whole train
  detailed: boolean; // letters and facilities are RTT's Know Your Train data
  countKnown: boolean; // false: RTT didn't say how many coaches, so `coaches` is a stand-in
  units: string[]; // the unit numbers RTT shows, front first
  leadingClass: string | null;
}

/** Every allocation in an answer, and which one applies on leaving each location. */
export interface FormationSet {
  byIndex: Map<number, Formation>;
  atPoint: (number | null)[];
  fallback: Formation;
}

const GUESS = 4; // drawn when RTT doesn't say how many coaches: a short train, labelled as unknown
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : []);
const unique = (xs: string[]) => [...new Set(xs)];
const plain = (n: number, unit = 0): Coach[] => Array.from({ length: n }, () => ({ letter: null, facilities: [], unit, passenger: true }));

function fromKnowYourTrain(kyt: Record<string, unknown>): Coach[] {
  const groups = Array.isArray(kyt.data) ? kyt.data.filter(isObj) : [];
  return groups.flatMap((g, unit) => {
    const shared = list(g.groupFacilities);
    const vehicles = Array.isArray(g.vehicles) ? g.vehicles.filter(isObj) : [];
    return vehicles.map((v) => ({
      letter: str(v.coachLetter),
      facilities: unique([...shared, ...list(v.individualFacilities)]),
      unit,
      passenger: v.isPassengerVehicle !== false,
    }));
  });
}

function fromAllocation(a: Record<string, unknown>, fallbackCount: number | null): Formation {
  const items = Array.isArray(a.allocationItems) ? a.allocationItems.filter(isObj) : [];
  const units = items.filter((i) => i.identity && !i.identitySuppressed).map((i) => String(i.identity));
  const kyt = obj(a.knowYourTrainData);
  const detailedCoaches = fromKnowYourTrain(kyt);
  const total = Number(a.passengerVehicles) || fallbackCount || 0;
  let coaches = detailedCoaches;
  if (!coaches.length) {
    // Coaches per unit where the allocation says, and whatever the total has left over in the first uncounted unit
    coaches = items.flatMap((item, unit) => plain(Number(item.numberOfVehicles) || 0, unit));
    const missing = total - coaches.length;
    const uncounted = items.findIndex((i) => !Number(i.numberOfVehicles));
    if (missing > 0) coaches.push(...plain(missing, uncounted >= 0 ? uncounted : Math.max(items.length - 1, 0)));
  }
  const countKnown = coaches.length > 0;
  return {
    coaches: countKnown ? coaches : plain(GUESS),
    facilities: list(kyt.commonFacilities),
    detailed: detailedCoaches.length > 0,
    countKnown,
    units,
    leadingClass: str(a.leadingClass),
  };
}

/** `fallbackCount`: the coach count from elsewhere in the answer (a location's numberOfVehicles), if any. */
export function parseFormations(body: unknown, fallbackCount: number | null): FormationSet {
  const s = obj(obj(body).service);
  const allocs = Array.isArray(s.allocationData) ? s.allocationData.filter(isObj) : [];
  const byIndex = new Map<number, Formation>();
  allocs.forEach((a, i) => byIndex.set(Number.isInteger(a.allocationIndex) ? Number(a.allocationIndex) : i, fromAllocation(a, fallbackCount)));
  const locs = Array.isArray(s.locations) ? s.locations.filter(isObj) : [];
  const atPoint = locs.map((l) => {
    const n = obj(l.locationMetadata).allocationIndex;
    return Number.isInteger(n) ? Number(n) : null;
  });
  return { byIndex, atPoint, fallback: fromAllocation({}, fallbackCount) };
}

/** The formation on leaving point `index` (the last one the train was reported at), or its first one. */
export function formationFor(set: FormationSet, index: number | null): Formation {
  const at = index == null ? null : set.atPoint[index];
  return (at != null ? set.byIndex.get(at) : undefined) ?? set.byIndex.values().next().value ?? set.fallback;
}
