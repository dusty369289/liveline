// The simulator must keep answering exactly as the frozen golden files say (test/golden/README.md), so demo mode
// shows the same trains release after release. Also checks the hashing and rounding it depends on.
import { describe, expect, it } from "vitest";
import { formationFor, parseFormations } from "../src/core/formation";
import { sha256Hex } from "../src/core/sha256";
import { simAllocation } from "../src/core/sim-stock";
import { h, roundHalfUp, SimTransport } from "../src/core/simulator";
import { isoLocal } from "../src/core/time";
import { readJson } from "./support";

const golden = readJson<any>("golden/simulator.json");

/**
 * A service answer without its allocation, and the allocation. The golden answers predate the demo's stock (units,
 * classes, coach letters: sim-stock.ts, 2026-11-07), so everything else is compared exactly, the coach count is
 * still held to the golden, and the stock itself is checked in "the demo's trains" below.
 */
function splitStock(body: any): [unknown, any] {
  if (!body?.service) return [body, undefined];
  const { allocationData, ...service } = body.service;
  return [{ ...body, service }, allocationData?.[0]];
}

it("sha256 matches known answers", () => {
  expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  expect(h("profile", "C12345", "2026-11-07")).toBe(parseInt(sha256Hex("profile|C12345|2026-11-07").slice(0, 12), 16));
});

it("rounds halves up, the same in both versions", () => {
  expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map(roundHalfUp)).toEqual([1, 2, 3, 0, -1, 2, 3]);
});

describe("simulator matches the golden answers", () => {
  for (const moment of golden) {
    describe(isoLocal(moment.now), () => {
      const sim = new SimTransport(() => moment.now);
      for (const [code, want] of Object.entries<{ status: number; body: unknown }>(moment.boards)) {
        it(`board ${code}`, () => {
          const r = sim.getSync("/gb-nr/location", { code, timeFrom: isoLocal(moment.now), timeWindow: "90" });
          expect(r.status).toBe(want.status);
          expect(r.body).toEqual(want.body);
        });
      }
      it("services", () => {
        for (const [uid, want] of Object.entries<{ status: number; body: unknown }>(moment.services)) {
          const r = sim.getSync("/gb-nr/service", { uniqueIdentity: uid });
          expect(r.status, uid).toBe(want.status);
          const [body, stock] = splitStock(r.body);
          const [wantBody, wantStock] = splitStock(want.body);
          expect(body, uid).toEqual(wantBody);
          expect(stock?.passengerVehicles, uid).toBe(wantStock?.passengerVehicles); // the same trains, same lengths
        }
      });
    });
  }
});

describe("the demo's trains", () => {
  const formation = (headcode: string, vehicles: number) =>
    formationFor(parseFormations({ service: { allocationData: [simAllocation(headcode, "C12345", vehicles)] } }, null), 0);

  it("the Oxford fast has coach letters and facilities, as with a Know Your Train key", () => {
    const f = formation("1P", 9);
    expect(f.detailed).toBe(true);
    expect(f.coaches.map((c) => c.letter).join("")).toBe("ABCDEFGHJ");
    expect(f.coaches[0].facilities).toContain("first");
    expect(f.leadingClass).toBe("800");
  });

  it("the others have units and counts only, as most keys get", () => {
    const f = formation("1D", 10);
    expect(f.detailed).toBe(false);
    expect(f.coaches.map((c) => c.unit)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    expect(f.units).toHaveLength(2);
  });

  it("the same train always gets the same units", () => {
    expect(simAllocation("2K", "W54321", 8)).toEqual(simAllocation("2K", "W54321", 8));
  });

  it("a pattern with no stock listed keeps the plain count", () => {
    expect(simAllocation("XX", "C1", 6)).toEqual({ allocationIndex: 0, passengerVehicles: 6 });
  });
});
