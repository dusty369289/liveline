// The simulator must keep answering exactly as the frozen golden files say (test/golden/README.md), so demo mode
// shows the same trains release after release. Also checks the hashing and rounding it depends on.
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/core/sha256";
import { h, roundHalfUp, SimTransport } from "../src/core/simulator";
import { isoLocal } from "../src/core/time";
import { readJson } from "./support";

const golden = readJson<any>("golden/simulator.json");

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
          expect(r.body, uid).toEqual(want.body);
        }
      });
    });
  }
});
