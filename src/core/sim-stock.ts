// The demo's trains, made up as RTT would describe them (allocationData), so the Train view has something to draw.
// One pattern carries Know Your Train data (coach letters and facilities), as a key with that entitlement would get;
// the others have only units and counts, as most keys get. Unit numbers come from the train's identity, so the same
// train always has the same units. Simulated, like everything in demo mode.
import { h } from "./simulator"; // (a cycle, but only a function used at call time)

interface Stock {
  cls: string;
  units: number[]; // coaches per unit, front first
  kyt?: { common: string[]; letters: string; facilities: Record<string, string[]> };
}

/** By the pattern's headcode prefix (simulator.ts PATTERNS). */
const STOCK: Record<string, Stock> = {
  "1P": { cls: "800", units: [9], kyt: { common: ["wifi", "power", "aircon"], letters: "ABCDEFGHJ",
    facilities: { A: ["first", "quiet"], B: ["first", "wheelchair", "toilet"], C: ["buffet"], E: ["toilet"],
      G: ["quiet"], H: ["wheelchair", "toilet", "baby-changing"], J: ["bicycle"] } } },
  "9R": { cls: "345", units: [9] },
  "2N": { cls: "166", units: [2, 2] },
  "1D": { cls: "444", units: [5, 5] },
  "2K": { cls: "450", units: [4, 4] },
};

export function simAllocation(headcode: string, identity: string, vehicles: number): Record<string, unknown> {
  const stock = STOCK[headcode];
  if (!stock) return { allocationIndex: 0, passengerVehicles: vehicles };
  const units = stock.units.map((n, i) => ({
    stockType: "unit", identity: `${stock.cls}${String(100 + (h("unit", identity, i) % 200)).padStart(3, "0")}`,
    inReverse: false, identitySuppressed: false, numberOfVehicles: n,
  }));
  const out: Record<string, unknown> = {
    allocationIndex: 0, leadingClass: stock.cls, passengerVehicles: stock.units.reduce((a, b) => a + b, 0), allocationItems: units,
  };
  if (stock.kyt) {
    const k = stock.kyt;
    out.knowYourTrainData = {
      stockBranding: null, commonFacilities: k.common,
      data: [{ identity: units[0].identity, groupFacilities: null, vehicles: [...k.letters].map((l) => ({
        isPassengerVehicle: true, coachLetter: l, individualFacilities: k.facilities[l] ?? null })) }],
    };
  }
  return out;
}
